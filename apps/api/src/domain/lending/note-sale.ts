import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import { NotResourceOwner } from '../marketplace/not-resource-owner';
import type { AccountId, LenderNoteId, LoanId, NoteSaleId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { AskExceedsCurrentValue } from './ask-exceeds-current-value';
import type { LenderNote } from './lender-note';
import type { Loan } from './loan';
import { LoanNotActive } from './loan-not-active';
import { NoteSaleNotOpen } from './note-sale-not-open';
import { NoteTransferDisabled } from './note-transfer-disabled';

export type NoteSaleStatus = 'OPEN' | 'SOLD' | 'WITHDRAWN' | 'VOIDED';

export type NoteSaleEvent = 'purchase' | 'withdraw' | 'void';

export const allowedNoteSaleTransitions: Record<NoteSaleStatus, readonly NoteSaleEvent[]> = {
  OPEN: ['purchase', 'withdraw', 'void'],
  SOLD: [],
  WITHDRAWN: [],
  VOIDED: [],
};

interface NoteSaleFields {
  readonly id: NoteSaleId;
  readonly lenderNoteId: LenderNoteId;
  readonly loanId: LoanId;
  readonly sellerAccountId: AccountId;
  readonly askPrice: Money;
  readonly createdAt: Instant;
  readonly status: NoteSaleStatus;
  readonly version: number;
}

export type ListNoteForSaleRejected =
  NoteTransferDisabled | NotResourceOwner | LoanNotActive | AskExceedsCurrentValue;

export type NoteSaleWithdrawalRejected = NoteSaleNotOpen | NotResourceOwner;

export interface ListNoteForSaleInput {
  readonly id: NoteSaleId;
  readonly note: LenderNote;
  readonly loan: Loan;
  readonly sellerAccountId: AccountId;
  readonly askPrice: Money;
  readonly parameters: ProtocolParameters;
  readonly now: Instant;
}

/* The fixed price sale of a lender note. What is sold is the note itself:
   settlement pays the seller and the holder changes, nothing on the loan
   moves. */
export class NoteSale {
  private constructor(private readonly fields: NoteSaleFields) {
    if (fields.askPrice.isNegative() || fields.askPrice.isZero()) {
      throw new Error('An ask price must be positive');
    }
  }

  get id(): NoteSaleId {
    return this.fields.id;
  }
  get lenderNoteId(): LenderNoteId {
    return this.fields.lenderNoteId;
  }
  get loanId(): LoanId {
    return this.fields.loanId;
  }
  get sellerAccountId(): AccountId {
    return this.fields.sellerAccountId;
  }
  get askPrice(): Money {
    return this.fields.askPrice;
  }
  get createdAt(): Instant {
    return this.fields.createdAt;
  }
  get status(): NoteSaleStatus {
    return this.fields.status;
  }
  get version(): number {
    return this.fields.version;
  }

  /* The cap is checked at listing time only. Interest accrues until maturity
     and never falls, so a sale inside the cap when listed can never drift
     out of it, and the purchase needs no revalidation of the price. */
  static list(input: ListNoteForSaleInput): Result<NoteSale, ListNoteForSaleRejected> {
    if (!input.parameters.notesTransferable || !input.note.transferable) {
      return failure(new NoteTransferDisabled());
    }
    if (input.note.holderAccountId !== input.sellerAccountId) {
      return failure(new NotResourceOwner());
    }
    if (input.loan.status !== 'ACTIVE') {
      return failure(new LoanNotActive());
    }
    const currentValue = input.loan.calculateAmountDue(input.now);
    if (input.askPrice.isGreaterThan(currentValue)) {
      return failure(new AskExceedsCurrentValue(currentValue));
    }
    return ok(
      new NoteSale({
        id: input.id,
        lenderNoteId: input.note.id,
        loanId: input.loan.id,
        sellerAccountId: input.sellerAccountId,
        askPrice: input.askPrice,
        createdAt: input.now,
        status: 'OPEN',
        version: 0,
      }),
    );
  }

  static restore(fields: NoteSaleFields): NoteSale {
    return new NoteSale(fields);
  }

  withdraw(requestedBy: AccountId): Result<NoteSale, NoteSaleWithdrawalRejected> {
    if (this.fields.sellerAccountId !== requestedBy) {
      return failure(new NotResourceOwner());
    }
    if (!this.allows('withdraw')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'WITHDRAWN' }));
  }

  markSold(): Result<NoteSale, NoteSaleNotOpen> {
    if (!this.allows('purchase')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'SOLD' }));
  }

  markVoided(): Result<NoteSale, NoteSaleNotOpen> {
    if (!this.allows('void')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'VOIDED' }));
  }

  allows(event: NoteSaleEvent): boolean {
    return allowedNoteSaleTransitions[this.fields.status].includes(event);
  }
}
