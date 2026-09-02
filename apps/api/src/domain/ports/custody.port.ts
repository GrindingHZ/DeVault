import type { CustodyReceipt } from '../custody/custody-receipt';
import type { ItemCategory } from '../custody/item-category';
import type { AccountId, LoanId, ReceiptId, StaffId, VaultId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import type { SettlementRef } from '../shared/settlement-ref';
import type { UnitOfWorkContext } from './unit-of-work';

export interface IssueReceiptCommand {
  readonly vaultId: VaultId;
  readonly holderAccountId: AccountId;
  readonly intakeRecordHash: string;
  readonly appraisedValue: Money;
  readonly appraisedAt: Instant;
  readonly appraiserId: StaffId;
  readonly itemCategory: ItemCategory;
  readonly itemDescription: string;
  readonly serialNumbers: readonly string[];
  readonly insurancePolicyReference: string;
}

export type BurnReason = 'REDEMPTION' | 'LIQUIDATION';

export interface CustodyPort {
  issueReceipt(
    command: IssueReceiptCommand,
    unitOfWork: UnitOfWorkContext,
  ): Promise<CustodyReceipt>;
  transferReceipt(
    receiptId: ReceiptId,
    toHolder: AccountId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  encumberReceipt(
    receiptId: ReceiptId,
    loanId: LoanId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<void>;
  releaseEncumbrance(receiptId: ReceiptId, unitOfWork: UnitOfWorkContext): Promise<void>;
  /* Moves encumbered collateral to the note holder who called the default.
     Distinct from transferReceipt, which is refused while a loan is live:
     this is the one transfer that is allowed precisely because one is. The
     receipt lands IN_VAULT under the claimant so they can redeem it through
     flow 6 with no special case. */
  claimReceipt(
    receiptId: ReceiptId,
    claimant: AccountId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  burnReceipt(
    receiptId: ReceiptId,
    reason: BurnReason,
    unitOfWork: UnitOfWorkContext,
  ): Promise<SettlementRef>;
  /* Extinguishes the seller's title and grants the buyer theirs, for the item
     a liquidation just sold.

     One custody operation rather than two, because it is one custody event:
     the item never leaves the vault, only the paper changes hands. Phase 3
     destroys the old object and mints the new one to the buyer in a single
     transaction, which is the shape this has to keep.

     Every descriptive field carries over, the intake record hash included. It
     is the same physical item and the same sealed evidence proves what it is,
     so the buyer's receipt shows the same photograph and the same serial
     numbers the borrower's did. */
  reissueToBuyer(
    receiptId: ReceiptId,
    buyer: AccountId,
    unitOfWork: UnitOfWorkContext,
  ): Promise<CustodyReceipt>;
}

export const CUSTODY_PORT = Symbol('CustodyPort');
