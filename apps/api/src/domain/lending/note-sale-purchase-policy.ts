import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import type { AccountId } from '../shared/identifiers';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { CannotBuyOwnPosition } from './cannot-buy-own-position';
import type { LenderNote } from './lender-note';
import type { Loan } from './loan';
import { LoanNotActive } from './loan-not-active';
import type { NoteSale } from './note-sale';
import { NoteSaleNotOpen } from './note-sale-not-open';
import { NoteTransferDisabled } from './note-transfer-disabled';

export type PurchaseNoteRejected =
  | NoteSaleNotOpen
  | NoteTransferDisabled
  | LoanNotActive
  | CannotBuyOwnPosition;

export interface PurchaseAttempt {
  readonly sale: NoteSale;
  readonly loan: Loan;
  readonly note: LenderNote;
  readonly buyerAccountId: AccountId;
  readonly parameters: ProtocolParameters;
}

export function assertNoteSalePurchasable(
  attempt: PurchaseAttempt,
): Result<void, PurchaseNoteRejected> {
  if (!attempt.sale.allows('purchase')) {
    return failure(new NoteSaleNotOpen());
  }
  if (!attempt.parameters.notesTransferable || !attempt.note.transferable) {
    return failure(new NoteTransferDisabled());
  }
  if (attempt.loan.status !== 'ACTIVE') {
    return failure(new LoanNotActive());
  }
  /* A holder who is no longer the seller means the sale describes a note it
     no longer speaks for, which is the same refusal as a closed sale. */
  if (attempt.note.holderAccountId !== attempt.sale.sellerAccountId) {
    return failure(new NoteSaleNotOpen());
  }
  /* The seller buying back is a no-op wearing a fee, and the borrower buying
     their own debt at a discount is a different product; see Q-030. */
  if (
    attempt.buyerAccountId === attempt.sale.sellerAccountId ||
    attempt.buyerAccountId === attempt.loan.borrowerAccountId
  ) {
    return failure(new CannotBuyOwnPosition());
  }
  return ok(undefined);
}
