import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { LoanNotFound } from '../../../domain/lending/loan-not-found';
import { NoteAlreadyListed } from '../../../domain/lending/note-already-listed';
import { NoteSale } from '../../../domain/lending/note-sale';
import { NOTE_SALE_REPOSITORY } from '../../../domain/lending/note-sale-repository';
import type { NoteSaleRepository } from '../../../domain/lending/note-sale-repository';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { noteSaleIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, LenderNoteId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ListNoteForSaleCommand {
  readonly lenderNoteId: LenderNoteId;
  readonly requestedBy: AccountId;
  readonly askPrice: Money;
}

/* Flow 18 step 1. Locks the loan so a listing cannot land between a
   repayment's void query and its commit. */
@Injectable()
export class ListNoteForSaleUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(NOTE_SALE_REPOSITORY) private readonly noteSales: NoteSaleRepository,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ListNoteForSaleCommand): Promise<Result<NoteSale, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        const located = await this.loans.findByLenderNoteId(command.lenderNoteId, context);
        if (located === null) {
          return failure(new LoanNotFound());
        }
        await this.loans.lock(located.id, context);
        const loan = await this.loans.findById(located.id, context);
        const note = await this.loans.findLenderNoteById(command.lenderNoteId, context);
        if (loan === null || note === null) {
          return failure(new LoanNotFound());
        }
        if ((await this.noteSales.findOpenByLoanId(loan.id, context)) !== null) {
          return failure(new NoteAlreadyListed());
        }

        const listed = NoteSale.list({
          id: noteSaleIdOf(this.idGenerator.generate()),
          note,
          loan,
          sellerAccountId: command.requestedBy,
          askPrice: command.askPrice,
          parameters: this.parameters,
          now: this.clock.now(),
        });
        if (!listed.ok) {
          return listed;
        }
        await this.noteSales.create(listed.value, context);

        await this.events.publish(
          [
            {
              type: 'NoteListedForSale',
              noteSaleId: listed.value.id,
              loanId: loan.id,
              askPrice: listed.value.askPrice,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'note_sale',
            subjectId: listed.value.id,
            action: 'list_note_for_sale',
            after: {
              loanId: loan.id,
              askPrice: listed.value.askPrice.minorUnits.toString(),
            },
          },
          context,
        );
        return ok(listed.value);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
