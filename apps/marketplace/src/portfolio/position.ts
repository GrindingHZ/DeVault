import { formatAmount, formatMoney, formatRate, interestOver } from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import type { LoanResponse, MyListingResponse, MyOfferResponse } from '@depawn/contracts';
import { toneOf } from './stages';
import type { StageName } from './stages';

/* Four screens rendered four database entities in four vocabularies, and a
   single loan appeared twice under two different names depending on who was
   reading it. This is the one shape they all become.

   Every mapper takes `asOf` rather than reading a clock, so a test does not
   have to travel in time and the demo clock cannot leak in through the back
   door. The value comes from the server on the loan list. */

export type PositionSide = 'borrowing' | 'lending';

export type PositionActionKind =
  'publish' | 'accept' | 'withdraw' | 'reclaim' | 'repay' | 'default' | 'collect' | 'claim';

export interface PositionAction {
  readonly label: string;
  readonly kind: PositionActionKind;
}

export interface PositionFigure {
  readonly label: string;
  readonly value: string;
}

export interface TermProgress {
  /* How far through the term, in basis points, clamped to the term. Past
     maturity it stays at ten thousand: interest stopped there (rule L1) and
     a bar that kept filling would say otherwise. */
  readonly elapsedBasisPoints: number;
  readonly note: string;
  readonly tone: StatusTone;
}

/* The numbers a loan turns on. Only a loan has them: a listing has no term
   and an offer has no principal out yet. */
export interface PositionMetrics {
  /* Named once, in the column headers. Every figure below is bare. */
  readonly currency: string;
  readonly principal: string;
  readonly rate: string;
  /* What it has cost or earned to the moment the server answered. */
  readonly interestSoFar: string;
  /* What is still to come between now and maturity, and what the whole term
     comes to. Pure arithmetic on the principal, the rate and the term, so no
     clock is involved beyond the one that produced `interestSoFar`. */
  readonly interestToCome: string;
  readonly interestWholeTerm: string;
  /* Borrower: what settling today would cost. Lender: what comes back if it
     runs to maturity. */
  readonly settlement: PositionFigure;
  /* The same figure without its currency code, for the table column. */
  readonly settlementAmount: string;
  readonly term: TermProgress;
}

/* What a listing or an offer turns on. A loan has `metrics`; these two have
   no term and no accrual, so they carry their own smaller set rather than
   leaving five columns empty. */
export interface PendingFigures {
  readonly currency: string;
  /* The listing's ask, or the money the offer is holding. Bare, because the
     column header names the currency. */
  readonly principal: string;
  /* The best rate standing on the listing, or the rate this offer names.
     Null on a listing nobody has offered on. */
  readonly rate: string | null;
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
     person. Every value is a key of `stages`, which is what the legend behind
     the status column renders. */
  readonly stage: StageName;
  readonly tone: StatusTone;
  /* The whole sub-line, not a fragment. An earlier version glued a phrase
     onto a fixed "You borrowed" or "You lent", which produced "You lent
     earning nothing until you ask for it back" on a losing offer: the reader
     never lent anything, the offer was outbid. Each case writes its own
     sentence. */
  readonly caption: string;
  /* The one number this kind of position turns on, for the attention band,
     which is one narrow column rather than a table. */
  readonly figure: PositionFigure | null;
  /* Null for anything that is not a live loan. See `metricsOf`. */
  readonly metrics: PositionMetrics | null;
  /* Null for anything that is not a listing or an offer. */
  readonly pending: PendingFigures | null;
  readonly action: PositionAction | null;
  readonly needsAttention: boolean;
}

/* One day. A loan three weeks out is not something anybody can act on today,
   and treating it as urgent is how an attention band turns back into a list
   of everything. */
export const maturityWarningMs = 24 * 60 * 60 * 1000;

const oneDay = maturityWarningMs;

function rateOf(basisPoints: number): string {
  return formatRate(basisPoints).replace(' p.a.', '');
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / oneDay));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/* Bare, because the loan tables name the currency once in the column header.
   Twenty repetitions of "AUD" down a column is noise that pushed every
   figure onto two lines. */
function amount(minorUnits: bigint, currency: string): string {
  return formatAmount({ minorUnits: minorUnits.toString(), currency });
}

function termOf(loan: LoanResponse, asOf: number): TermProgress {
  /* The status is what settles this, not the dates. A loan can be marked
     defaulted while its maturity date is still ahead, and a row reading
     "Defaulted" beside "19 days to maturity" contradicts itself. */
  if (loan.status === 'DEFAULTED') {
    return { elapsedBasisPoints: 10_000, note: 'term ended in default', tone: 'danger' };
  }
  const startedAt = Date.parse(loan.startedAt);
  const maturesAt = Date.parse(loan.maturesAt);
  const graceEndsAt = Date.parse(loan.graceEndsAt);
  const span = maturesAt - startedAt;
  if (!Number.isFinite(span) || span <= 0) {
    return { elapsedBasisPoints: 0, note: 'term unknown', tone: 'neutral' };
  }

  const elapsed = Math.min(Math.max(asOf - startedAt, 0), span);
  const elapsedBasisPoints = Math.round((elapsed / span) * 10_000);

  if (asOf > graceEndsAt) {
    return { elapsedBasisPoints: 10_000, note: 'grace has run out', tone: 'danger' };
  }
  if (asOf > maturesAt) {
    return {
      elapsedBasisPoints: 10_000,
      note: `matured, ${plural(daysBetween(asOf, graceEndsAt), 'day')} of grace left`,
      tone: 'warning',
    };
  }
  return {
    elapsedBasisPoints,
    note: `${plural(daysBetween(asOf, maturesAt), 'day')} to maturity`,
    tone: 'active',
  };
}

/* Null once a loan is repaid or sold.

   The server recomputes accrued interest against its clock on every read, so
   a repaid loan reports what a full term would have cost rather than what
   was actually paid: the moment of repayment is not recorded (Q-029). A
   closed row therefore says it is closed and shows no interest figure, which
   is less than a reader might want and all that is currently true. */
function metricsOf(loan: LoanResponse, asOf: number, side: PositionSide): PositionMetrics | null {
  if (loan.status !== 'ACTIVE' && loan.status !== 'DEFAULTED') {
    return null;
  }

  const currency = loan.principal.currency;
  const principal = BigInt(loan.principal.minorUnits);
  const soFar = BigInt(loan.accruedInterest.minorUnits);
  const wholeTerm = interestOver(
    loan.principal.minorUnits,
    loan.annualPercentageRateBasisPoints,
    Date.parse(loan.maturesAt) - Date.parse(loan.startedAt),
  );
  /* Never negative. Interest clamps at maturity, so past it the whole term
     has already accrued and there is nothing left to come. */
  const toCome = wholeTerm > soFar ? wholeTerm - soFar : 0n;

  return {
    currency,
    principal: amount(principal, currency),
    rate: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
    interestSoFar: amount(soFar, currency),
    interestToCome: amount(toCome, currency),
    interestWholeTerm: amount(wholeTerm, currency),
    /* The attention band is one narrow column with no header to carry a
       currency, so its figure keeps the code. */
    settlement:
      side === 'borrowing'
        ? {
            label: 'Owed today',
            value: formatMoney({ minorUnits: (principal + soFar).toString(), currency }),
          }
        : {
            label: 'Value at maturity',
            value: formatMoney({ minorUnits: (principal + wholeTerm).toString(), currency }),
          },
    settlementAmount: amount(principal + (side === 'borrowing' ? soFar : wholeTerm), currency),
    term: termOf(loan, asOf),
  };
}

function staged(
  stage: StageName,
  side: PositionSide,
): { readonly stage: StageName; readonly tone: StatusTone } {
  return { stage, tone: toneOf(stage, side) };
}

/* Null when the loan says the same thing better. A matched listing and an
   accepted offer are both the prologue to a loan that is already a row of its
   own, and showing all three was the duplication this screen exists to end. */
export function positionOfListing(listing: MyListingResponse): Position | null {
  const base = {
    id: `listing-${listing.id}`,
    side: 'borrowing' as const,
    itemDescription: listing.itemDescription,
    listingId: listing.id,
    loanId: null,
    offerId: null,
    metrics: null,
    pending: {
      currency: listing.requestedPrincipal.currency,
      principal: formatAmount(listing.requestedPrincipal),
      rate:
        listing.bestOfferRateBasisPoints === null ? null : rateOf(listing.bestOfferRateBasisPoints),
    },
  };

  if (listing.status === 'DRAFT') {
    return {
      ...base,
      ...staged('Draft', 'borrowing'),
      caption: 'Nobody can see this until you publish it',
      figure: { label: 'Asking', value: formatMoney(listing.requestedPrincipal) },
      action: { label: 'Publish', kind: 'publish' },
      needsAttention: false,
    };
  }

  if (listing.status === 'ACTIVE') {
    return {
      ...base,
      ...staged('Taking offers', 'borrowing'),
      caption:
        listing.offerCount === 0
          ? 'Waiting for a lender'
          : `${plural(listing.offerCount, 'lender')} competing`,
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

  /* The loan is a row of its own and says everything this one would, only
     currently. A matched listing that still read "Funded" beside a loan that
     had since been repaid was the screen contradicting itself. */
  if (listing.status === 'MATCHED') {
    return null;
  }

  return {
    ...base,
    ...staged(listing.status === 'CANCELLED' ? 'Cancelled' : 'Expired', 'borrowing'),
    caption: listing.status === 'CANCELLED' ? 'You took it down' : 'It ran out of time',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

export function positionOfOffer(offer: MyOfferResponse): Position | null {
  const base = {
    id: `offer-${offer.id}`,
    side: 'lending' as const,
    itemDescription: offer.itemDescription,
    listingId: offer.listingId,
    loanId: null,
    offerId: offer.id,
    metrics: null,
    pending: {
      currency: offer.principal.currency,
      principal: formatAmount(offer.principal),
      rate: rateOf(offer.annualPercentageRateBasisPoints),
    },
  };

  if (offer.status === 'PENDING') {
    return {
      ...base,
      ...staged('Standing', 'lending'),
      caption: 'Your money is held against this',
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
      ...staged(offer.status === 'SUPERSEDED' ? 'Outbid' : 'Expired', 'lending'),
      caption: 'Your money is still held, and earning nothing',
      figure: { label: 'Held', value: formatMoney(offer.principal) },
      action: { label: 'Reclaim funds', kind: 'reclaim' },
      needsAttention: true,
    };
  }

  /* The winning offer became a loan, and the loan is the live row. */
  if (offer.status === 'ACCEPTED') {
    return null;
  }

  return {
    ...base,
    ...staged('Withdrawn', 'lending'),
    caption: 'You pulled it before it was taken',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

export function positionOfBorrowedLoan(loan: LoanResponse, asOf: number): Position {
  const base = {
    id: `borrowed-${loan.id}`,
    side: 'borrowing' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
    metrics: metricsOf(loan, asOf, 'borrowing'),
    pending: null,
  };

  if (loan.status === 'ACTIVE') {
    const maturesAt = Date.parse(loan.maturesAt);
    const isDue = Number.isFinite(maturesAt) && maturesAt - asOf <= maturityWarningMs;
    const isPastMaturity = Number.isFinite(maturesAt) && asOf > maturesAt;
    const stage = isPastMaturity ? 'In grace' : 'Running';
    return {
      ...base,
      stage,
      /* Warning overrides the stage's own tone: a loan due tomorrow is still
         "Running" and still wants the reader's eye. */
      tone: isDue ? 'warning' : toneOf(stage, 'borrowing'),
      caption: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
      figure: base.metrics?.settlement ?? null,
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
      ...staged('Repaid', 'borrowing'),
      caption: 'Paid off, and the item is waiting in the vault under your name',
      figure: null,
      action: { label: 'Collect the item', kind: 'collect' },
      needsAttention: true,
    };
  }

  if (loan.status === 'DEFAULTED') {
    return {
      ...base,
      ...staged('Defaulted', 'borrowing'),
      caption: 'You did not repay in time, and the lender may claim the item',
      figure: { label: 'Principal', value: formatMoney(loan.principal) },
      action: null,
      needsAttention: true,
    };
  }

  return {
    ...base,
    ...staged('Sold', 'borrowing'),
    caption: 'The item was sold to cover the loan',
    figure: { label: 'Principal', value: formatMoney(loan.principal) },
    action: null,
    needsAttention: false,
  };
}

export function positionOfLentLoan(loan: LoanResponse, asOf: number): Position {
  const base = {
    id: `lent-${loan.id}`,
    side: 'lending' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
    metrics: metricsOf(loan, asOf, 'lending'),
    pending: null,
  };

  if (loan.status === 'ACTIVE') {
    /* Grace has run out and the borrower has not repaid. Nothing happens on
       its own: the lender has to say so before the collateral is theirs to
       claim (docs/10-flows.md flow 11). */
    const graceEndsAt = Date.parse(loan.graceEndsAt);
    if (Number.isFinite(graceEndsAt) && asOf > graceEndsAt) {
      return {
        ...base,
        ...staged('Past grace', 'lending'),
        caption: 'The borrower did not repay, and grace has run out',
        figure: { label: 'At risk', value: formatMoney(loan.principal) },
        action: { label: 'Mark defaulted', kind: 'default' },
        needsAttention: true,
      };
    }
    return {
      ...base,
      ...staged('Earning', 'lending'),
      caption: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
      figure: { label: 'Earned so far', value: formatMoney(loan.accruedInterest) },
      action: null,
      needsAttention: false,
    };
  }

  /* The lender's side of the same event the borrower reads as a disaster.
     Here it is something to act on: the collateral can be claimed. */
  if (loan.status === 'DEFAULTED') {
    return {
      ...base,
      ...staged('Defaulted', 'lending'),
      caption: 'The item is yours to claim',
      figure: { label: 'At risk', value: formatMoney(loan.principal) },
      action: { label: 'Claim the collateral', kind: 'claim' },
      needsAttention: true,
    };
  }

  if (loan.status === 'REPAID') {
    return {
      ...base,
      ...staged('Settled', 'lending'),
      caption: 'The borrower paid in full',
      figure: null,
      action: null,
      needsAttention: false,
    };
  }

  return {
    ...base,
    ...staged('Sold', 'lending'),
    caption: 'The item was sold and you were paid from the proceeds',
    figure: null,
    action: null,
    needsAttention: false,
  };
}
