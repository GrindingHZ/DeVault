import {
  fetchMyBids,
  fetchMyListings,
  fetchMyLoans,
  fetchMyNoteSales,
  fetchMyOffers,
  fetchMyReceipts,
  fetchMyRedemptionRequests,
} from '@depawn/contracts';
import type { LoanResponse, NoteSaleSummary, RedemptionStatusDto } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import { marketKeys } from '../market-keys';
import { attentionOf } from './attention';
import {
  positionOfBid,
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
  /* Bids on collateral sales, which hold money the same way offers do. Left
     out until now, so a beaten bidder had no screen anywhere that could tell
     them their money was still committed (docs/14-state-machines.md). */
  const bidsQuery = useQuery({ queryKey: marketKeys.myBids, queryFn: fetchMyBids });
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
  /* Whether the reader already took the collateral on a defaulted loan. The
     loan stays DEFAULTED whatever happens next, so the claim shows up as the
     receipt arriving in their own inventory rather than as anything on the
     loan. Without it the row kept offering a claim the server then refused
     with `RECEIPT_NOT_ENCUMBERED`. */
  const receiptsQuery = useQuery({ queryKey: marketKeys.myReceipts, queryFn: fetchMyReceipts });
  /* Whether a lent position is already on the secondary market, so the row
     offers the withdrawal rather than a second listing the server refuses. */
  const noteSalesQuery = useQuery({ queryKey: marketKeys.myNoteSales, queryFn: fetchMyNoteSales });

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

  /* Which items are actually sitting in the vault waiting to be walked out
     of, decided once per item rather than once per loan.

     A repaid loan used to conclude on its own that its collateral must be
     waiting, which was true right up until the reader listed the item again,
     borrowed against it a second time, or collected it under a later loan.
     After any of those the row went on offering to collect something that had
     moved on, and the bell went on counting it. The receipt knows: it is in
     the vault, under nobody's loan, with nothing listed against it. */
  const listedReceiptIds = new Set(
    (listingsQuery.data?.items ?? [])
      .filter((listing) => listing.status === 'DRAFT' || listing.status === 'ACTIVE')
      .map((listing) => listing.receiptId),
  );
  const collectableReceiptIds = new Set(
    (receiptsQuery.data?.items ?? [])
      .filter(
        (receipt) =>
          receipt.status === 'IN_VAULT' &&
          !listedReceiptIds.has(receipt.id) &&
          !redemptionByReceipt.has(receipt.id),
      )
      .map((receipt) => receipt.id),
  );
  /* One errand per item, on the loan that most recently pledged it. Two
     loans against the same thing would otherwise each ask for it back, and
     only one of them can be collected. */
  const latestLoanIdByReceipt = new Map<string, string>();
  for (const loan of [...borrowedLoans].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  )) {
    latestLoanIdByReceipt.set(loan.receiptId, loan.id);
  }

  const borrowedLoanPositions = borrowedLoans
    .map((loan) =>
      positionOfBorrowedLoan(
        loan,
        borrowedAsOf,
        redemptionByReceipt.get(loan.receiptId) ?? null,
        collectableReceiptIds.has(loan.receiptId) &&
          latestLoanIdByReceipt.get(loan.receiptId) === loan.id,
      ),
    )
    .sort(byItem);
  const heldReceiptIds = new Set((receiptsQuery.data?.items ?? []).map((receipt) => receipt.id));
  const openSaleByLoanId = new Map<string, NoteSaleSummary>();
  for (const sale of noteSalesQuery.data?.items ?? []) {
    if (sale.status === 'OPEN') {
      openSaleByLoanId.set(sale.loanId, sale);
    }
  }
  const lentLoanPositions = lentLoans
    .map((loan) =>
      positionOfLentLoan(
        loan,
        lentAsOf,
        heldReceiptIds.has(loan.receiptId),
        openSaleByLoanId.get(loan.id) ?? null,
      ),
    )
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
  const bidAsOf = Date.parse(bidsQuery.data?.asOf ?? '') || Date.now();
  const bidPositions = (bidsQuery.data?.items ?? [])
    .map((bid) => positionOfBid(bid, bidAsOf))
    .sort(byItem);

  const borrowing = [...borrowedLoanPositions, ...listingPositions].sort(byItem);
  const lending = [...lentLoanPositions, ...offerPositions, ...bidPositions].sort(byItem);
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
      bidsQuery.isPending ||
      borrowedQuery.isPending ||
      lentQuery.isPending ||
      redemptionsQuery.isPending ||
      receiptsQuery.isPending,
    unavailable: [
      listingsQuery.isError ? 'your listings' : null,
      offersQuery.isError ? 'your offers' : null,
      bidsQuery.isError ? 'your bids' : null,
      borrowedQuery.isError ? 'what you owe' : null,
      lentQuery.isError ? 'what you are owed' : null,
    ].filter((one): one is string => one !== null),
  };
}
