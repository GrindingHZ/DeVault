import {
  fetchMyListings,
  fetchMyLoans,
  fetchMyOffers,
  fetchMyRedemptionRequests,
} from '@depawn/contracts';
import type { LoanResponse, RedemptionStatusDto } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import { marketKeys } from '../market-keys';
import { attentionOf } from './attention';
import {
  positionOfBorrowedLoan,
  positionOfLentLoan,
  positionOfListing,
  positionOfOffer,
} from './position';
import type { Position } from './position';

export interface Positions {
  readonly borrowedLoans: readonly LoanResponse[];
  readonly lentLoans: readonly LoanResponse[];
  /* One list per side, loans and the things that become loans together. */
  readonly borrowing: readonly Position[];
  readonly lending: readonly Position[];
  readonly everyPosition: readonly Position[];
  /* What the reader would regret not doing today, across both sides. */
  readonly attention: readonly Position[];
  readonly isPending: boolean;
  /* Plain language names for whichever lists failed, so a screen can say
     what it is missing rather than showing a smaller number as if it were
     the whole truth. */
  readonly unavailable: readonly string[];
}

/* Money at work first, then money waiting on somebody else. A loan is a
   position; a listing and an offer are closer to a working order. Within
   each, by item, so anything about the same object sits together. */
function byItem(left: Position, right: Position): number {
  const leftAtWork = left.metrics === null ? 1 : 0;
  const rightAtWork = right.metrics === null ? 1 : 0;
  if (leftAtWork !== rightAtWork) {
    return leftAtWork - rightAtWork;
  }
  return left.itemDescription.localeCompare(right.itemDescription);
}

/* One read of everything the reader holds, shared by the header and the
   portfolio.

   The header needs it because the bell has to know whether anything is
   waiting, on every screen. The portfolio needs it because it is the screen
   made of it. They call this rather than each running their own queries:
   React Query dedupes by key, so two callers cost one request and can never
   disagree about what needs doing. */
export function usePositions(): Positions {
  const listingsQuery = useQuery({ queryKey: marketKeys.myListings, queryFn: fetchMyListings });
  const offersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });
  const borrowedQuery = useQuery({
    queryKey: marketKeys.myLoans('borrower'),
    queryFn: () => fetchMyLoans('borrower'),
  });
  const lentQuery = useQuery({
    queryKey: marketKeys.myLoans('lender'),
    queryFn: () => fetchMyLoans('lender'),
  });
  /* Whether the item behind a repaid loan has been asked for. Without it the
     row kept offering to collect something already requested, and the
     notification kept counting it. */
  const redemptionsQuery = useQuery({
    queryKey: marketKeys.myRedemptions,
    queryFn: fetchMyRedemptionRequests,
  });

  const borrowedLoans = borrowedQuery.data?.items ?? [];
  const lentLoans = lentQuery.data?.items ?? [];

  /* The server's clock, not the browser's. A demo process runs weeks ahead
     (docs/10-flows.md flow 15), so a term drawn against `Date.now()` would
     report a matured loan as barely started. The browser is the fallback
     only while the query is in flight, when there are no loans to draw. */
  const borrowedAsOf = Date.parse(borrowedQuery.data?.asOf ?? '') || Date.now();
  const lentAsOf = Date.parse(lentQuery.data?.asOf ?? '') || Date.now();

  /* Latest first, so a receipt redeemed more than once reports where it has
     got to now rather than where it got to the first time. */
  const redemptionByReceipt = new Map<string, RedemptionStatusDto>();
  for (const request of redemptionsQuery.data?.items ?? []) {
    redemptionByReceipt.set(request.receiptId, request.status);
  }

  const borrowedLoanPositions = borrowedLoans
    .map((loan) =>
      positionOfBorrowedLoan(loan, borrowedAsOf, redemptionByReceipt.get(loan.receiptId) ?? null),
    )
    .sort(byItem);
  const lentLoanPositions = lentLoans
    .map((loan) => positionOfLentLoan(loan, lentAsOf))
    .sort(byItem);
  const listingAsOf = Date.parse(listingsQuery.data?.asOf ?? '') || Date.now();
  const offerAsOf = Date.parse(offersQuery.data?.asOf ?? '') || Date.now();

  const listingPositions = (listingsQuery.data?.items ?? [])
    .map((listing) => positionOfListing(listing, listingAsOf))
    .filter((one): one is Position => one !== null)
    .sort(byItem);
  const offerPositions = (offersQuery.data?.items ?? [])
    .map((offer) => positionOfOffer(offer, offerAsOf))
    .filter((one): one is Position => one !== null)
    .sort(byItem);

  const borrowing = [...borrowedLoanPositions, ...listingPositions].sort(byItem);
  const lending = [...lentLoanPositions, ...offerPositions].sort(byItem);
  const everyPosition = [...borrowing, ...lending];

  return {
    borrowedLoans,
    lentLoans,
    borrowing,
    lending,
    everyPosition,
    attention: attentionOf(everyPosition),
    isPending:
      listingsQuery.isPending ||
      offersQuery.isPending ||
      borrowedQuery.isPending ||
      lentQuery.isPending ||
      redemptionsQuery.isPending,
    unavailable: [
      listingsQuery.isError ? 'your listings' : null,
      offersQuery.isError ? 'your offers' : null,
      borrowedQuery.isError ? 'what you owe' : null,
      lentQuery.isError ? 'what you are owed' : null,
    ].filter((one): one is string => one !== null),
  };
}
