import type { AccountId, ListingId, OfferId, ReceiptId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Instant } from '../shared/instant';
import type { Listing } from './listing';

export interface ListingRepository {
  findById(id: ListingId, context: UnitOfWorkContext): Promise<Listing | null>;
  findByOffer(offerId: OfferId, context: UnitOfWorkContext): Promise<Listing | null>;
  findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Listing | null>;
  listByBorrower(borrower: AccountId, context: UnitOfWorkContext): Promise<readonly Listing[]>;
  /* Listings still calling themselves ACTIVE with their date behind them, and
     the ids of pending offers in the same state. Ids rather than aggregates,
     because the sweep takes them one at a time in its own transaction: a
     batch that expired forty listings at once would be forty state changes
     the chain could not express as one call. */
  listExpiredActiveIds(now: Instant, context: UnitOfWorkContext): Promise<readonly ListingId[]>;
  listExpiredPendingOfferIds(now: Instant, context: UnitOfWorkContext): Promise<readonly OfferId[]>;
  /* Serialises offer placement against acceptance; the Phase 3 equivalent is
     shared object consensus ordering on the Listing. */
  lock(id: ListingId, context: UnitOfWorkContext): Promise<void>;
  save(listing: Listing, context: UnitOfWorkContext): Promise<void>;
}

export const LISTING_REPOSITORY = Symbol('ListingRepository');
