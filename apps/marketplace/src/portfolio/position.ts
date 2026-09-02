import { formatMoney, formatRate } from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import type { LoanResponse, MyListingResponse, MyOfferResponse } from '@depawn/contracts';

/* Four screens rendered four database entities in four vocabularies, and a
   single loan appeared twice under two different names depending on who was
   reading it. This is the one shape they all become.

   Every mapper takes `now` rather than reading a clock, so a test does not
   have to travel in time and the demo clock cannot leak in through the back
   door. */

export type PositionSide = 'borrowing' | 'lending';

export type PositionActionKind =
  'publish' | 'accept' | 'withdraw' | 'reclaim' | 'repay' | 'collect' | 'claim';

export interface PositionAction {
  readonly label: string;
  readonly kind: PositionActionKind;
}

export interface PositionFigure {
  readonly label: string;
  readonly value: string;
}

export interface Position {
  readonly id: string;
  readonly side: PositionSide;
  readonly itemDescription: string;
  readonly listingId: string | null;
  readonly loanId: string | null;
  readonly offerId: string | null;
  /* What is happening, in words. Never a status enum: IN_VAULT and SUPERSEDED
     are correct names for a state machine and the wrong thing to shout at a
     person (packages/contracts/src/status-copy.ts). */
  readonly stage: string;
  readonly tone: StatusTone;
  /* The one number this kind of position turns on. Which number that is
     differs per kind, which is why a shared table cannot simply print a
     column and call it done. */
  readonly figure: PositionFigure | null;
  readonly action: PositionAction | null;
  readonly needsAttention: boolean;
}

/* One day. A loan three weeks out is not something anybody can act on today,
   and treating it as urgent is how an attention band turns back into a list
   of everything. */
export const maturityWarningMs = 24 * 60 * 60 * 1000;

function rateOf(basisPoints: number): string {
  return formatRate(basisPoints).replace(' p.a.', '');
}

export function positionOfListing(listing: MyListingResponse): Position {
  const base = {
    id: `listing-${listing.id}`,
    side: 'borrowing' as const,
    itemDescription: listing.itemDescription,
    listingId: listing.id,
    loanId: null,
    offerId: null,
  };

  if (listing.status === 'DRAFT') {
    return {
      ...base,
      stage: 'Draft',
      tone: 'neutral',
      figure: { label: 'Asking', value: formatMoney(listing.requestedPrincipal) },
      action: { label: 'Publish', kind: 'publish' },
      needsAttention: false,
    };
  }

  if (listing.status === 'ACTIVE') {
    return {
      ...base,
      stage: 'Taking offers',
      tone: 'active',
      figure:
        listing.bestOfferRateBasisPoints === null
          ? { label: 'Best offer', value: 'none yet' }
          : { label: 'Best offer', value: rateOf(listing.bestOfferRateBasisPoints) },
      /* Only offer-able when there is something to accept. A button that
         opens an empty book is a button that wasted a click. */
      action: listing.offerCount > 0 ? { label: 'Accept an offer', kind: 'accept' } : null,
      needsAttention: false,
    };
  }

  if (listing.status === 'MATCHED') {
    return {
      ...base,
      stage: 'Funded',
      tone: 'success',
      figure: { label: 'Borrowed', value: formatMoney(listing.requestedPrincipal) },
      action: null,
      needsAttention: false,
    };
  }

  return {
    ...base,
    stage: listing.status === 'CANCELLED' ? 'Cancelled' : 'Expired',
    tone: 'neutral',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

export function positionOfOffer(offer: MyOfferResponse): Position {
  const base = {
    id: `offer-${offer.id}`,
    side: 'lending' as const,
    itemDescription: offer.itemDescription,
    listingId: offer.listingId,
    loanId: null,
    offerId: offer.id,
  };

  if (offer.status === 'PENDING') {
    return {
      ...base,
      stage: 'Standing',
      tone: 'active',
      figure: { label: 'Your rate', value: rateOf(offer.annualPercentageRateBasisPoints) },
      action: { label: 'Withdraw', kind: 'withdraw' },
      needsAttention: false,
    };
  }

  /* The one nobody ever finds. Money sitting in a hold that lost is earning
     nothing and will sit there until its owner asks for it back, because
     refunds are pull and not push (docs/10-flows.md flow 9). */
  if (offer.status === 'SUPERSEDED' || offer.status === 'EXPIRED') {
    return {
      ...base,
      stage: offer.status === 'SUPERSEDED' ? 'Outbid' : 'Expired',
      tone: 'warning',
      figure: { label: 'Held', value: formatMoney(offer.principal) },
      action: { label: 'Reclaim', kind: 'reclaim' },
      needsAttention: true,
    };
  }

  if (offer.status === 'ACCEPTED') {
    return {
      ...base,
      stage: 'Accepted',
      tone: 'success',
      figure: { label: 'Your rate', value: rateOf(offer.annualPercentageRateBasisPoints) },
      action: null,
      needsAttention: false,
    };
  }

  return {
    ...base,
    stage: 'Withdrawn',
    tone: 'neutral',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

function owedToday(loan: LoanResponse): string {
  return formatMoney({
    minorUnits: (
      BigInt(loan.principal.minorUnits) + BigInt(loan.accruedInterest.minorUnits)
    ).toString(),
    currency: loan.principal.currency,
  });
}

export function positionOfBorrowedLoan(loan: LoanResponse, now: number): Position {
  const base = {
    id: `borrowed-${loan.id}`,
    side: 'borrowing' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
  };

  if (loan.status === 'ACTIVE') {
    const maturesAt = Date.parse(loan.maturesAt);
    const isDue = Number.isFinite(maturesAt) && maturesAt - now <= maturityWarningMs;
    const isPastMaturity = Number.isFinite(maturesAt) && now > maturesAt;
    return {
      ...base,
      stage: isPastMaturity ? 'In grace' : 'Running',
      tone: isDue ? 'warning' : 'active',
      figure: { label: 'Owed today', value: owedToday(loan) },
      action: { label: 'Repay', kind: 'repay' },
      needsAttention: isDue,
    };
  }

  /* Repaid means the collateral is back in the borrower's name and sitting in
     a vault waiting to be walked out of. Nobody is going to remember that
     unless the interface says so. */
  if (loan.status === 'REPAID') {
    return {
      ...base,
      stage: 'Repaid',
      tone: 'success',
      figure: null,
      action: { label: 'Collect the item', kind: 'collect' },
      needsAttention: true,
    };
  }

  if (loan.status === 'DEFAULTED') {
    return {
      ...base,
      stage: 'Defaulted',
      tone: 'danger',
      figure: { label: 'Principal', value: formatMoney(loan.principal) },
      action: null,
      needsAttention: true,
    };
  }

  return {
    ...base,
    stage: 'Sold',
    tone: 'danger',
    figure: { label: 'Principal', value: formatMoney(loan.principal) },
    action: null,
    needsAttention: false,
  };
}

export function positionOfLentLoan(loan: LoanResponse): Position {
  const base = {
    id: `lent-${loan.id}`,
    side: 'lending' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
  };

  if (loan.status === 'ACTIVE') {
    return {
      ...base,
      stage: 'Earning',
      tone: 'active',
      figure: { label: 'Accrued', value: formatMoney(loan.accruedInterest) },
      action: null,
      needsAttention: false,
    };
  }

  /* The lender's side of the same event the borrower reads as a disaster.
     Here it is something to act on: the collateral can be claimed. */
  if (loan.status === 'DEFAULTED') {
    return {
      ...base,
      stage: 'Defaulted',
      tone: 'danger',
      figure: { label: 'At risk', value: formatMoney(loan.principal) },
      action: { label: 'Claim the collateral', kind: 'claim' },
      needsAttention: true,
    };
  }

  if (loan.status === 'REPAID') {
    return {
      ...base,
      stage: 'Settled',
      tone: 'success',
      figure: { label: 'Earned', value: formatMoney(loan.accruedInterest) },
      action: null,
      needsAttention: false,
    };
  }

  return {
    ...base,
    stage: 'Sold',
    tone: 'neutral',
    figure: { label: 'Principal', value: formatMoney(loan.principal) },
    action: null,
    needsAttention: false,
  };
}
