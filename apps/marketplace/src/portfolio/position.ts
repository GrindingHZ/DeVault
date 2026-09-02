import { formatAmount, formatMoney, formatRate, interestOver } from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import type {
  LoanResponse,
  MyListingResponse,
  MyOfferResponse,
  NoteSaleSummary,
  RedemptionStatusDto,
} from '@depawn/contracts';
import { isTerminal, toneOf } from './stages';
import type { StageName } from './stages';

/* Four screens rendered four database entities in four vocabularies, and a
   single loan appeared twice under two different names depending on who was
   reading it. This is the one shape they all become.

   Every mapper takes `asOf` rather than reading a clock, so a test does not
   have to travel in time and the demo clock cannot leak in through the back
   door. The value comes from the server on the loan list. */

export type PositionSide = 'borrowing' | 'lending';

export type PositionActionKind =
  | 'publish'
  | 'accept'
  | 'withdraw'
  | 'reclaim'
  | 'repay'
  | 'default'
  | 'collect'
  | 'claim'
  | 'sell'
  | 'withdrawSale';

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
     a bar that kept filling would say otherwise.

     Null when there is a deadline but no start to measure from. A listing
     and an offer both expire, and neither records when it began, so they get
     the words without the bar rather than a bar drawn from a guess. */
  readonly elapsedBasisPoints: number | null;
  /* Where the term has got to, said as a count out of its length. A bar on
     its own answers "roughly how far", which is not the question: a borrower
     wants to know it is day twenty one of thirty. */
  readonly note: string;
  /* What that leaves, when there is anything to leave. Two lines rather than
     one, because "day 21 of 30" and "9 days left" are different questions
     and a reader should not have to subtract to answer the second.

     Split, so the quantity carries the weight and the grammar around it does
     not: "9 days" is the fact, "left" is the sentence it sits in. */
  readonly caption: TermPhrase | null;
  readonly tone: StatusTone;
}

/* A quantity and the words around it, so only the quantity is emphasised. */
export interface TermPhrase {
  readonly value: string;
  readonly trail: string;
}

/* The numbers a loan turns on. Only a loan has them: a listing has no term
   and an offer has no principal out yet. */
export interface PositionMetrics {
  /* Named once, in the column headers. Every figure below is bare. */
  readonly currency: string;
  readonly rate: string;
  /* What it has cost or earned to the moment the server answered. */
  readonly interestSoFar: string;
  /* What is still to come between now and maturity, and what the whole term
     comes to. Pure arithmetic on the principal, the rate and the term, so no
     clock is involved beyond the one that produced `interestSoFar`. */
  readonly interestToCome: string;
  readonly interestWholeTerm: string;
  /* How much of the term's interest has built up, in basis points, for the
     bar in the interest column. Derived from the two figures above rather
     than from the clock, so the length and the numbers beside it cannot
     disagree. */
  readonly interestFilledBasisPoints: number;
  /* Borrower: what settling today would cost. Lender: what comes back if it
     runs to maturity. */
  readonly settlement: PositionFigure;
  /* The same figure without its currency code, for the table column. */
  readonly settlementAmount: string;
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
  /* How much is at stake: what a loan is for, what a listing asks, what an
     offer holds. Known for every row including a closed one, which is why it
     sits here rather than inside `metrics`: what a settled loan was worth is
     a fact, and only its interest figure is untrustworthy (Q-029). Bare,
     because the column header names the currency. */
  readonly amount: string | null;
  /* Null for anything that is not a live loan. See `metricsOf`. */
  readonly metrics: PositionMetrics | null;
  /* How long is left, whatever the thing is: a loan runs to maturity, a
     listing and an offer run to their expiry. Null once nothing is counting
     down any more, which is what a closed row shows. */
  readonly term: TermProgress | null;
  /* Where to fetch the photograph, or null when there is none to fetch.
     A person recognises their own things by sight long before they read a
     description, which is why the browse rail leads with one. */
  readonly photographSrc: string | null;
  /* Null for anything that is not a listing or an offer. */
  readonly pending: PendingFigures | null;
  /* The claim a lent loan pays into, which is what a sale sells. Null on
     every other kind of row. */
  readonly lenderNoteId: string | null;
  /* The open sale on this position, when one is standing. */
  readonly noteSale: { readonly id: string; readonly askPrice: string } | null;
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
   Twenty repetitions of "USD" down a column is noise that pushed every
   figure onto two lines. */
function amount(minorUnits: bigint, currency: string): string {
  return formatAmount({ minorUnits: minorUnits.toString(), currency });
}

function photographOf(receiptId: string, hasPhotograph: boolean): string | null {
  return hasPhotograph ? `/api/v1/receipts/${receiptId}/photo` : null;
}

/* A deadline with no start to measure from: the words, and no bar. */
function closesIn(expiresAtIso: string, asOf: number): TermProgress {
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) {
    return { elapsedBasisPoints: null, note: 'no closing date', caption: null, tone: 'neutral' };
  }
  if (asOf > expiresAt) {
    return {
      elapsedBasisPoints: null,
      note: 'past its closing date',
      caption: null,
      tone: 'warning',
    };
  }
  const remaining = expiresAt - asOf;
  if (remaining < oneDay) {
    return {
      elapsedBasisPoints: null,
      note: 'closes',
      caption: { value: 'today', trail: '' },
      tone: 'warning',
    };
  }
  return {
    elapsedBasisPoints: null,
    note: 'closes in',
    caption: { value: plural(daysBetween(asOf, expiresAt), 'day'), trail: '' },
    tone: 'active',
  };
}

function termOf(loan: LoanResponse, asOf: number): TermProgress {
  /* The status is what settles this, not the dates. A loan can be marked
     defaulted while its maturity date is still ahead, and a row reading
     "Defaulted" beside "19 days to maturity" contradicts itself. */
  if (loan.status === 'DEFAULTED') {
    return {
      elapsedBasisPoints: 10_000,
      note: 'term ended in default',
      caption: null,
      tone: 'danger',
    };
  }
  const startedAt = Date.parse(loan.startedAt);
  const maturesAt = Date.parse(loan.maturesAt);
  const graceEndsAt = Date.parse(loan.graceEndsAt);
  const span = maturesAt - startedAt;
  if (!Number.isFinite(span) || span <= 0) {
    return { elapsedBasisPoints: 0, note: 'term unknown', caption: null, tone: 'neutral' };
  }

  const elapsed = Math.min(Math.max(asOf - startedAt, 0), span);
  const elapsedBasisPoints = Math.round((elapsed / span) * 10_000);

  /* Counted from one: the day a loan is drawn down is its first day, not its
     zeroth. Rounded rather than truncated so a term of thirty days and a
     daylight saving hour is still thirty days. */
  const termDays = Math.max(1, Math.round(span / oneDay));
  const dayNow = Math.min(termDays, Math.floor(elapsed / oneDay) + 1);

  if (asOf > graceEndsAt) {
    return { elapsedBasisPoints: 10_000, note: 'grace has run out', caption: null, tone: 'danger' };
  }
  if (asOf > maturesAt) {
    return {
      elapsedBasisPoints: 10_000,
      note: `day ${String(termDays)} of ${String(termDays)}`,
      caption: { value: plural(daysBetween(asOf, graceEndsAt), 'day'), trail: 'of grace left' },
      tone: 'warning',
    };
  }
  return {
    elapsedBasisPoints,
    /* Short. The column is called Term, so "to maturity" was a phrase
       repeated on every row that pushed the action button off the side. */
    note: `day ${String(dayNow)} of ${String(termDays)}`,
    caption: { value: plural(daysBetween(asOf, maturesAt), 'day'), trail: 'left' },
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
  /* Integer arithmetic to a share of ten thousand, like every other
     proportion in this product. Zero rather than full when a term costs
     nothing, because a bar filled to the end would say the borrower has run
     up an interest bill they have not. */
  const interestFilledBasisPoints =
    wholeTerm <= 0n ? 0 : Math.min(10_000, Number((soFar * 10_000n) / wholeTerm));

  return {
    currency,
    rate: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
    interestSoFar: amount(soFar, currency),
    interestToCome: amount(toCome, currency),
    interestWholeTerm: amount(wholeTerm, currency),
    interestFilledBasisPoints,
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
export function positionOfListing(listing: MyListingResponse, asOf: number): Position | null {
  const base = {
    id: `listing-${listing.id}`,
    side: 'borrowing' as const,
    itemDescription: listing.itemDescription,
    listingId: listing.id,
    loanId: null,
    offerId: null,
    lenderNoteId: null,
    noteSale: null,
    metrics: null,
    photographSrc: photographOf(listing.receiptId, listing.hasPhotograph),
    amount: formatAmount(listing.requestedPrincipal),
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
      term: null,
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
      term: closesIn(listing.expiresAt, asOf),
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
    term: null,
    caption: listing.status === 'CANCELLED' ? 'You took it down' : 'It ran out of time',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

export function positionOfOffer(offer: MyOfferResponse, asOf: number): Position | null {
  const base = {
    id: `offer-${offer.id}`,
    side: 'lending' as const,
    itemDescription: offer.itemDescription,
    listingId: offer.listingId,
    loanId: null,
    offerId: offer.id,
    lenderNoteId: null,
    noteSale: null,
    metrics: null,
    photographSrc: photographOf(offer.receiptId, offer.hasPhotograph),
    amount: formatAmount(offer.principal),
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
      term: closesIn(offer.expiresAt, asOf),
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
      term: null,
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
    term: null,
    caption: 'You pulled it before it was taken',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

/* Whether the item behind a repaid loan has been asked for, and how far that
   has got. Null when no request exists yet.

   Without it a repaid loan offered "Collect the item" for ever: the row had
   no idea the reader had already walked in and asked, so the notification
   kept telling them to do a thing they had done. */
export function positionOfBorrowedLoan(
  loan: LoanResponse,
  asOf: number,
  redemption: RedemptionStatusDto | null = null,
): Position {
  const base = {
    id: `borrowed-${loan.id}`,
    side: 'borrowing' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
    lenderNoteId: null,
    noteSale: null,
    metrics: metricsOf(loan, asOf, 'borrowing'),
    amount: formatAmount(loan.principal),
    pending: null,
    photographSrc: photographOf(loan.receiptId, loan.hasPhotograph),
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
      term: termOf(loan, asOf),
      caption: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
      figure: base.metrics?.settlement ?? null,
      action: { label: 'Repay', kind: 'repay' },
      needsAttention: isDue,
    };
  }

  /* Repaid means the collateral is back in the borrower's name and sitting in
     a vault waiting to be walked out of. Nobody is going to remember that
     unless the interface says so, which is why it is the one terminal stage
     that still asks for something.

     It stops asking the moment a request exists. Staff take it from there:
     they verify identity and break the seal at the counter, and neither is
     something this screen can do or should keep nagging about. */
  if (loan.status === 'REPAID') {
    if (redemption === 'RELEASED') {
      return {
        ...base,
        ...staged('Collected', 'borrowing'),
        term: null,
        caption: 'You have it back, and the receipt is spent',
        figure: null,
        action: null,
        needsAttention: false,
      };
    }
    if (redemption !== null) {
      return {
        ...base,
        ...staged('Collection requested', 'borrowing'),
        term: null,
        caption: 'The vault is expecting you. Bring photo identification to the counter',
        figure: null,
        action: null,
        needsAttention: false,
      };
    }
    return {
      ...base,
      ...staged('Repaid', 'borrowing'),
      term: null,
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
      term: termOf(loan, asOf),
      caption: 'You did not repay in time, and the lender may claim the item',
      figure: { label: 'Principal', value: formatMoney(loan.principal) },
      action: null,
      needsAttention: true,
    };
  }

  return {
    ...base,
    ...staged('Sold', 'borrowing'),
    term: null,
    caption: 'The item was sold to cover the loan',
    figure: { label: 'Principal', value: formatMoney(loan.principal) },
    action: null,
    needsAttention: false,
  };
}

/* Whether the reader already took the collateral. A claim does not change
   the loan, which stays DEFAULTED for ever, so the loan alone cannot say. The
   receipt can: claiming moves it into the claimant's name, which puts it in
   their own inventory. */
export function positionOfLentLoan(
  loan: LoanResponse,
  asOf: number,
  hasClaimed = false,
  openSale: NoteSaleSummary | null = null,
): Position {
  const base = {
    id: `lent-${loan.id}`,
    side: 'lending' as const,
    itemDescription: loan.itemDescription,
    listingId: null,
    loanId: loan.id,
    offerId: null,
    lenderNoteId: loan.lenderNoteId,
    noteSale:
      openSale === null ? null : { id: openSale.id, askPrice: formatMoney(openSale.askPrice) },
    metrics: metricsOf(loan, asOf, 'lending'),
    amount: formatAmount(loan.principal),
    pending: null,
    photographSrc: photographOf(loan.receiptId, loan.hasPhotograph),
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
        term: termOf(loan, asOf),
        caption: 'The borrower did not repay, and grace has run out',
        figure: { label: 'At risk', value: formatMoney(loan.principal) },
        action: { label: 'Mark defaulted', kind: 'default' },
        needsAttention: true,
      };
    }
    if (base.noteSale !== null) {
      return {
        ...base,
        ...staged('Listed for sale', 'lending'),
        term: termOf(loan, asOf),
        caption: 'On the secondary market, waiting for a buyer',
        figure: { label: 'Ask', value: base.noteSale.askPrice },
        action: { label: 'Withdraw sale', kind: 'withdrawSale' },
        needsAttention: false,
      };
    }
    return {
      ...base,
      ...staged('Earning', 'lending'),
      term: termOf(loan, asOf),
      caption: `${rateOf(loan.annualPercentageRateBasisPoints)} p.a.`,
      figure: { label: 'Earned so far', value: formatMoney(loan.accruedInterest) },
      action: { label: 'Sell position', kind: 'sell' },
      needsAttention: false,
    };
  }

  /* The lender's side of the same event the borrower reads as a disaster.
     Here it is something to act on: the collateral can be claimed.

     Once. The server refuses a second claim with `RECEIPT_NOT_ENCUMBERED`,
     which is correct and unreadable: the receipt is no longer securing
     anything because the reader already took it. */
  if (loan.status === 'DEFAULTED') {
    if (hasClaimed) {
      return {
        ...base,
        ...staged('Claimed', 'lending'),
        term: null,
        caption: 'The item is in the vault under your name',
        figure: null,
        action: null,
        needsAttention: false,
      };
    }
    return {
      ...base,
      ...staged('Defaulted', 'lending'),
      term: termOf(loan, asOf),
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
      term: null,
      caption: 'The borrower paid in full',
      figure: null,
      action: null,
      needsAttention: false,
    };
  }

  return {
    ...base,
    ...staged('Sold', 'lending'),
    term: null,
    caption: 'The item was sold and you were paid from the proceeds',
    figure: null,
    action: null,
    needsAttention: false,
  };
}

/* What the reader is still watching, as against what is behind them.

   Terminal by stage, except that something still to do keeps a position in
   view: a repaid loan whose item is sitting in a vault is finished as a loan
   and unfinished as an errand, and burying it under a disclosure would hide
   the only control that ends it. */
export function isOpen(position: Position): boolean {
  return !isTerminal(position.stage, position.side) || position.action !== null;
}
