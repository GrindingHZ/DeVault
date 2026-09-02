/* The state machines are correct and their names are correct. `IN_VAULT` and
   `SUPERSEDED` are exactly the right words for a domain model and exactly the
   wrong ones to shout at a customer, so this is the one place that turns a
   state into something a person reads. The enum on the wire never changes.

   Written from the reader's side: a listing is not `MATCHED`, it is funded;
   an offer is not `SUPERSEDED`, it was outbid. */
const receiptStatuses: Record<string, string> = {
  IN_VAULT: 'In the vault',
  ENCUMBERED: 'Securing a loan',
  RELEASED: 'Collected',
  LIQUIDATED: 'Sold',
};

const listingStatuses: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Taking offers',
  MATCHED: 'Funded',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const offerStatuses: Record<string, string> = {
  PENDING: 'Standing',
  ACCEPTED: 'Accepted',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Outbid',
};

const loanStatuses: Record<string, string> = {
  ACTIVE: 'Running',
  REPAID: 'Repaid',
  DEFAULTED: 'Defaulted',
  LIQUIDATED: 'Sold',
};

const redemptionStatuses: Record<string, string> = {
  REQUESTED: 'Requested',
  VERIFIED: 'Identity verified',
  RELEASED: 'Handed over',
};

const liquidationStatuses: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  BIDDING: 'Taking bids',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
};

/* Falls back to the code itself. An unnamed state is better shown raw than
   hidden: staff can still read it and report it. */
function nameFrom(table: Record<string, string>, status: string): string {
  return table[status] ?? status;
}

export const nameForReceiptStatus = (status: string): string => nameFrom(receiptStatuses, status);
export const nameForListingStatus = (status: string): string => nameFrom(listingStatuses, status);
export const nameForOfferStatus = (status: string): string => nameFrom(offerStatuses, status);
export const nameForLoanStatus = (status: string): string => nameFrom(loanStatuses, status);
export const nameForRedemptionStatus = (status: string): string =>
  nameFrom(redemptionStatuses, status);
export const nameForLiquidationStatus = (status: string): string =>
  nameFrom(liquidationStatuses, status);

/* What happened to the reader's money, not the table that recorded it.
   `HOLD_FUNDS` is the correct name for a ledger transaction kind and tells a
   person nothing about their own wallet. */
const ledgerKinds: Record<string, string> = {
  DEPOSIT: 'Deposit',
  HOLD_FUNDS: 'Held for an offer',
  REFUND_HOLD: 'Hold returned',
  ORIGINATE_LOAN: 'Loan funded',
  REPAY_LOAN: 'Loan repaid',
  SELL_NOTE: 'Position sold',
  SETTLE_LIQUIDATION: 'Sale settled',
  WITHDRAW: 'Withdrawal',
};

/* A person reading their own wallet is not doing double entry bookkeeping,
   and to them a debit and a credit are money leaving and money arriving. The
   ledger keeps its own vocabulary; this is the reader's. */
const entryDirections: Record<string, string> = {
  DEBIT: 'Out',
  CREDIT: 'In',
};

/* Past tense, because an audit row is a record of something that already
   happened. The subject follows in its own column, so these deliberately do
   not name it: "placed an offer", never "placed an offer on a listing". */
const auditActions: Record<string, string> = {
  accept_offer: 'accepted an offer',
  attach_photo: 'attached a photograph',
  begin_intake: 'began an intake',
  cancel_listing: 'cancelled a listing',
  claim_receipt: 'claimed the collateral',
  close_liquidation: 'closed a sale',
  confirm_release: 'handed the item over',
  create_listing: 'created a listing',
  issue_receipt: 'issued a receipt',
  mark_default: 'marked a loan defaulted',
  open_liquidation: 'opened a sale',
  pause_system: 'paused trading',
  place_bid: 'placed a bid',
  place_offer: 'placed an offer',
  publish_listing: 'published a listing',
  reclaim_bid: 'reclaimed a bid',
  reclaim_hold: 'reclaimed a hold',
  reconcile_vault: 'reconciled a vault',
  record_appraisal: 'recorded an appraisal',
  repay_loan: 'repaid a loan',
  request_redemption: 'asked for an item back',
  schedule_liquidation: 'scheduled a sale',
  seal_intake: 'sealed an intake',
  unpause_system: 'resumed trading',
  update_intake: 'updated an intake',
  update_protocol_parameters: 'changed the protocol parameters',
  verify_redemption: 'verified an identity',
  withdraw_offer: 'withdrew an offer',
};

/* Which of the reader's two balances a movement touched. Without this the
   wallet showed both legs of a hold as two rows with the same amount and no
   way to tell them apart, which reads as the money moving twice. */
const balancePurposes: Record<string, string> = {
  USER_AVAILABLE: 'Available',
  USER_HELD: 'Held',
};

export const nameForBalancePurpose = (purpose: string): string =>
  nameFrom(balancePurposes, purpose);

export const nameForLedgerKind = (kind: string): string => nameFrom(ledgerKinds, kind);
export const nameForEntryDirection = (direction: string): string =>
  nameFrom(entryDirections, direction);
export const nameForAuditAction = (action: string): string => nameFrom(auditActions, action);
