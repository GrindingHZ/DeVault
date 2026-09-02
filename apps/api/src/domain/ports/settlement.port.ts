import type { AccountId, FundsHoldId } from '../shared/identifiers';
import type { Currency, Money } from '../shared/money';
import type { Distribution, SettlementRef } from '../shared/settlement-ref';
import type { UnitOfWorkContext } from './unit-of-work';

export interface HoldFundsCommand {
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly reference: string;
}

export interface FundsHold {
  readonly id: FundsHoldId;
  readonly accountId: AccountId;
  readonly amount: Money;
  readonly settlementRef: SettlementRef;
}

/* Why money is moving, which the ledger records as the kind. Named at the
   call site for the same reason releaseHold names its reason (Q-010): once a
   note sale exists there are two user to user movements, and the adapter can
   no longer tell them apart from the participants. */
export type TransferReason = 'DEPOSIT' | 'WITHDRAW' | 'REPAY_LOAN' | 'SELL_NOTE';

export interface TransferCommand {
  readonly fromAccountId: AccountId;
  readonly toAccountId: AccountId;
  readonly amount: Money;
  readonly reference: string;
  readonly reason: TransferReason;
}

/* Why a hold is being released, which the ledger records as the kind of the
   transaction. Naming it at the call site keeps the adapter from guessing
   from the shape of a distribution (Q-010). */
export type ReleaseReason = 'ORIGINATE_LOAN' | 'SETTLE_LIQUIDATION';

export interface SettlementPort {
  hold(command: HoldFundsCommand, unitOfWork: UnitOfWorkContext): Promise<FundsHold>;
  releaseHold(
    hold: FundsHold,
    distribution: Distribution[],
    reason: ReleaseReason,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  refundHold(hold: FundsHold, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  transfer(command: TransferCommand, unitOfWork: UnitOfWorkContext): Promise<SettlementRef>;
  availableBalance(accountId: AccountId, currency: Currency): Promise<Money>;
}

export const SETTLEMENT_PORT = Symbol('SettlementPort');
