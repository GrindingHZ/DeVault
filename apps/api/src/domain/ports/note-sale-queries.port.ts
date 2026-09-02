import type { ItemCategory } from '../custody/item-category';
import type { NoteSaleStatus } from '../lending/note-sale';
import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import type { Money } from '../shared/money';

/* Everything the positions page draws, priced on the server. The client
   renders these figures and never derives one (docs/05-frontend.md). */
export interface NoteSaleSummaryReadModel {
  readonly id: string;
  readonly loanId: string;
  readonly lenderNoteId: string;
  readonly sellerAccountId: string;
  readonly status: NoteSaleStatus;
  readonly askPrice: Money;
  readonly createdAt: Instant;
  readonly receiptId: string;
  readonly itemDescription: string;
  readonly itemCategory: ItemCategory;
  /* Whether the media endpoint will actually serve a photograph of this item.
     The predicate is the browse read model's, so a row cannot promise a
     picture the endpoint then refuses. */
  readonly hasPhotograph: boolean;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly startedAt: Instant;
  readonly maturesAt: Instant;
  readonly accruedInterest: Money;
  readonly currentValue: Money;
  readonly maturityValue: Money;
}

export interface NoteSaleQueries {
  browseOpen(now: Instant): Promise<readonly NoteSaleSummaryReadModel[]>;
  mine(accountId: AccountId, now: Instant): Promise<readonly NoteSaleSummaryReadModel[]>;
  byId(id: string, now: Instant): Promise<NoteSaleSummaryReadModel | null>;
}

export const NOTE_SALE_QUERIES = Symbol('NoteSaleQueries');
