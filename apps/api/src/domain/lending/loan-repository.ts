import type { AccountId, LenderNoteId, LoanId, ReceiptId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { BorrowerNote } from './borrower-note';
import type { LenderNote } from './lender-note';
import type { Loan } from './loan';

export interface OriginatedLoan {
  readonly loan: Loan;
  readonly lenderNote: LenderNote;
  readonly borrowerNote: BorrowerNote;
}

export interface LoanRepository {
  findById(id: LoanId, context: UnitOfWorkContext): Promise<Loan | null>;
  /* Serialises repayment against any other write to the loan; the Phase 3
     equivalent is shared object consensus ordering on the Loan. */
  lock(id: LoanId, context: UnitOfWorkContext): Promise<void>;
  /* The note holder is resolved inside the repaying transaction so a note
     transfer cannot land between the read and the payment. */
  findLenderNoteHolder(id: LoanId, context: UnitOfWorkContext): Promise<AccountId | null>;
  findByLenderNoteId(noteId: LenderNoteId, context: UnitOfWorkContext): Promise<Loan | null>;
  findLenderNoteById(noteId: LenderNoteId, context: UnitOfWorkContext): Promise<LenderNote | null>;
  /* The one mutation a note ever sees. The sale use case is its only caller,
     inside the transaction that also moved the money. */
  reassignLenderNoteHolder(
    noteId: LenderNoteId,
    holderAccountId: AccountId,
    context: UnitOfWorkContext,
  ): Promise<void>;
  findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Loan | null>;
  /* Origination persists the loan and both notes together; later phases save
     the loan alone through save. */
  saveOrigination(originated: OriginatedLoan, context: UnitOfWorkContext): Promise<void>;
  save(loan: Loan, context: UnitOfWorkContext): Promise<void>;
}

export const LOAN_REPOSITORY = Symbol('LoanRepository');
