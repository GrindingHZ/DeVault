import { Inject, Injectable } from '@nestjs/common';
import type { Liquidation } from '../../../domain/lending/liquidation';
import { LIQUIDATION_REPOSITORY } from '../../../domain/lending/liquidation-repository';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import { LiquidationNotFound } from '../../../domain/lending/liquidation-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { AccountId, LiquidationId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface CancelLiquidationCommand {
  readonly liquidationId: LiquidationId;
  readonly requestedBy: AccountId;
  readonly reason: string;
}

/* Calling off a sale that was scheduled and never opened.

   Scheduling a liquidation is a judgement, and judgements are sometimes
   wrong: a borrower settles privately, the appraisal is disputed, the wrong
   loan is picked. Until now the entity could cancel and nothing could ask it
   to, so CANCELLED was a state the schema held and the product could not
   enter (docs/14-state-machines.md finding 3).

   Only from SCHEDULED, which is the entity's own guard and the reason this
   use case needs no refunds: an open sale has bids behind it, every bid holds
   somebody's money, and calling one off would have to return all of them.
   That is a different operation and it does not exist. Close it instead. */
@Injectable()
export class CancelLiquidationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LIQUIDATION_REPOSITORY) private readonly liquidations: LiquidationRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  /* No pause check. Pausing stops money and collateral moving; this moves
     neither, and a paused system is exactly when somebody wants to call a
     scheduled sale off (flow 11). */
  execute(command: CancelLiquidationCommand): Promise<Result<Liquidation, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.liquidations.lock(command.liquidationId, context);
      const liquidation = await this.liquidations.findById(command.liquidationId, context);
      if (liquidation === null) {
        return failure(new LiquidationNotFound());
      }

      const cancelled = liquidation.cancel();
      if (!cancelled.ok) {
        return cancelled;
      }
      await this.liquidations.save(cancelled.value, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'liquidation',
          subjectId: liquidation.id,
          action: 'cancel_liquidation',
          before: { status: liquidation.status },
          after: { status: cancelled.value.status, reason: command.reason },
        },
        context,
      );
      return ok(cancelled.value);
    });
  }
}
