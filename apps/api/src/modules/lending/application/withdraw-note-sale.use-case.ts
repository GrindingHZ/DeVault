import { Inject, Injectable } from '@nestjs/common';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import type { NoteSale } from '../../../domain/lending/note-sale';
import { NoteSaleNotFound } from '../../../domain/lending/note-sale-not-found';
import { NOTE_SALE_REPOSITORY } from '../../../domain/lending/note-sale-repository';
import type { NoteSaleRepository } from '../../../domain/lending/note-sale-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, NoteSaleId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface WithdrawNoteSaleCommand {
  readonly noteSaleId: NoteSaleId;
  readonly requestedBy: AccountId;
}

/* Flow 18, the seller's exit from the exit. Locks the loan like every other
   note sale write, so a withdrawal racing a purchase reads current state
   rather than dying on a stale version. */
@Injectable()
export class WithdrawNoteSaleUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(NOTE_SALE_REPOSITORY) private readonly noteSales: NoteSaleRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(command: WithdrawNoteSaleCommand): Promise<Result<NoteSale, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        const located = await this.noteSales.findById(command.noteSaleId, context);
        if (located === null) {
          return failure(new NoteSaleNotFound());
        }
        await this.loans.lock(located.loanId, context);
        const sale = await this.noteSales.findById(command.noteSaleId, context);
        if (sale === null) {
          return failure(new NoteSaleNotFound());
        }

        const withdrawn = sale.withdraw(command.requestedBy);
        if (!withdrawn.ok) {
          return withdrawn;
        }
        await this.noteSales.save(withdrawn.value, context);

        await this.events.publish([{ type: 'NoteSaleWithdrawn', noteSaleId: sale.id }], context);
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'note_sale',
            subjectId: sale.id,
            action: 'withdraw_note_sale',
            before: { status: sale.status },
            after: { status: withdrawn.value.status },
          },
          context,
        );
        return ok(withdrawn.value);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
