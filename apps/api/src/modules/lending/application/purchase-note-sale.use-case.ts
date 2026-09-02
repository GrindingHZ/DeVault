import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import type { NoteSale } from '../../../domain/lending/note-sale';
import { NoteSaleNotFound } from '../../../domain/lending/note-sale-not-found';
import { assertNoteSalePurchasable } from '../../../domain/lending/note-sale-purchase-policy';
import { NOTE_SALE_REPOSITORY } from '../../../domain/lending/note-sale-repository';
import type { NoteSaleRepository } from '../../../domain/lending/note-sale-repository';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, NoteSaleId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface PurchaseNoteSaleCommand {
  readonly noteSaleId: NoteSaleId;
  readonly requestedBy: AccountId;
}

export interface PurchaseOutcome {
  readonly sale: NoteSale;
  readonly paidTo: AccountId;
  readonly price: Money;
}

/* Flow 18 step 2, the whole trade in one transaction: the payment, the sale
   status, and the note holder cannot come apart, which is what makes this
   one Move transaction later (docs/08-web3-migration.md). */
@Injectable()
export class PurchaseNoteSaleUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(NOTE_SALE_REPOSITORY) private readonly noteSales: NoteSaleRepository,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(command: PurchaseNoteSaleCommand): Promise<Result<PurchaseOutcome, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        const located = await this.noteSales.findById(command.noteSaleId, context);
        if (located === null) {
          return failure(new NoteSaleNotFound());
        }
        await this.loans.lock(located.loanId, context);
        const sale = await this.noteSales.findById(command.noteSaleId, context);
        const loan = sale === null ? null : await this.loans.findById(sale.loanId, context);
        const note =
          sale === null ? null : await this.loans.findLenderNoteById(sale.lenderNoteId, context);
        if (sale === null || loan === null || note === null) {
          return failure(new NoteSaleNotFound());
        }

        const purchasable = assertNoteSalePurchasable({
          sale,
          loan,
          note,
          buyerAccountId: command.requestedBy,
          parameters: this.parameters,
        });
        if (!purchasable.ok) {
          return purchasable;
        }

        const settlementRef = await this.settlement.transfer(
          {
            fromAccountId: command.requestedBy,
            toAccountId: sale.sellerAccountId,
            amount: sale.askPrice,
            reference: sale.id,
            reason: 'SELL_NOTE',
          },
          context,
        );

        const sold = sale.markSold();
        if (!sold.ok) {
          return sold;
        }
        await this.noteSales.save(sold.value, context);
        await this.loans.reassignLenderNoteHolder(note.id, command.requestedBy, context);

        await this.events.publish(
          [
            {
              type: 'NoteSold',
              noteSaleId: sale.id,
              loanId: loan.id,
              fromAccountId: sale.sellerAccountId,
              toAccountId: command.requestedBy,
              price: sale.askPrice,
              settlementRef,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'note_sale',
            subjectId: sale.id,
            action: 'purchase_note_sale',
            before: { holder: sale.sellerAccountId },
            after: {
              holder: command.requestedBy,
              price: sale.askPrice.minorUnits.toString(),
              settlementRef: settlementRef.reference,
            },
          },
          context,
        );
        return ok({ sale: sold.value, paidTo: sale.sellerAccountId, price: sale.askPrice });
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
