import { describe, expect, it } from 'vitest';
import type { LoanResponse, MyListingResponse, MyOfferResponse } from '@depawn/contracts';
import {
  isOpen,
  maturityWarningMs,
  positionOfBorrowedLoan,
  positionOfLentLoan,
  positionOfListing,
  positionOfOffer,
} from './position';

const now = Date.parse('2026-08-23T12:00:00.000Z');
const oneDay = 24 * 60 * 60 * 1000;

function money(minorUnits: string) {
  return { minorUnits, currency: 'AUD' as const };
}

function listing(overrides: Partial<MyListingResponse> = {}): MyListingResponse {
  return {
    id: 'L1',
    borrowerAccountId: 'ada',
    receiptId: 'R1',
    requestedPrincipal: money('400000'),
    maxAnnualPercentageRateBasisPoints: 2400,
    requestedDurationMs: 30 * oneDay,
    expiresAt: '2026-09-23T12:00:00.000Z',
    status: 'ACTIVE',
    itemDescription: 'Omega Speedmaster',
    itemCategory: 'WATCH',
    hasPhotograph: true,
    bestOfferRateBasisPoints: 1100,
    offerCount: 3,
    ...overrides,
  };
}

function offer(overrides: Partial<MyOfferResponse> = {}): MyOfferResponse {
  return {
    id: 'O1',
    listingId: 'L1',
    lenderAccountId: 'gita',
    principal: money('400000'),
    annualPercentageRateBasisPoints: 1800,
    durationMs: 30 * oneDay,
    expiresAt: '2026-09-23T12:00:00.000Z',
    createdAt: '2026-08-20T12:00:00.000Z',
    status: 'PENDING',
    itemDescription: 'Omega Speedmaster',
    receiptId: 'R1',
    hasPhotograph: true,
    ...overrides,
  };
}

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: 'LN1',
    receiptId: 'R1',
    itemDescription: 'Omega Speedmaster',
    hasPhotograph: true,
    borrowerAccountId: 'ada',
    principal: money('400000'),
    annualPercentageRateBasisPoints: 1800,
    startedAt: '2026-08-01T12:00:00.000Z',
    maturesAt: '2026-09-30T12:00:00.000Z',
    graceEndsAt: '2026-10-07T12:00:00.000Z',
    lenderNoteHolderAccountId: 'gita',
    status: 'ACTIVE',
    accruedInterest: money('5917'),
    originationSettlementRef: {
      kind: 'ledger',
      reference: 'SR1',
      settledAt: '2026-08-01T12:00:00.000Z',
    },
    ...overrides,
  };
}

/* Correct names for a state machine, and the wrong thing to shout at a
   person. Nothing this model produces should be one. */
const screamingSnakeCase = /^[A-Z][A-Z0-9_]*$/;

/* The two mappers that can decline. Unwrapping here rather than at every
   call keeps the assertions about the mapping rather than about null. */
function listingPosition(input: MyListingResponse) {
  const position = positionOfListing(input, now);
  if (position === null) {
    throw new Error('the listing produced no position');
  }
  return position;
}

function offerPosition(input: MyOfferResponse) {
  const position = positionOfOffer(input, now);
  if (position === null) {
    throw new Error('the offer produced no position');
  }
  return position;
}

describe('a listing as a position', () => {
  it('offers to publish a draft', () => {
    const position = listingPosition(listing({ status: 'DRAFT' }));
    expect(position.stage).toBe('Draft');
    expect(position.action?.kind).toBe('publish');
    expect(position.needsAttention).toBe(false);
  });

  it('shows the best offer on a live listing', () => {
    const position = listingPosition(listing());
    expect(position.stage).toBe('Taking offers');
    expect(position.figure).toEqual({ label: 'Best offer', value: '11.00%' });
    expect(position.action?.kind).toBe('accept');
  });

  it('says there is no offer yet rather than showing a rate of nothing', () => {
    const position = listingPosition(listing({ bestOfferRateBasisPoints: null, offerCount: 0 }));
    expect(position.figure?.value).toBe('none yet');
  });

  /* A button that opens an empty book is a button that wasted a click. */
  it('offers nothing to accept when nobody has offered', () => {
    expect(listingPosition(listing({ offerCount: 0 })).action).toBeNull();
  });

  /* The loan that came out of it is a row of its own and says everything
     this one would, only currently. A matched listing still reading "Funded"
     beside a loan since repaid was the screen contradicting itself. */
  it('leaves a matched listing to the loan it produced', () => {
    expect(positionOfListing(listing({ status: 'MATCHED' }), now)).toBeNull();
  });

  it('says how many lenders are competing rather than a bare count', () => {
    expect(listingPosition(listing({ offerCount: 1 })).caption).toBe('1 lender competing');
    expect(listingPosition(listing({ offerCount: 3 })).caption).toBe('3 lenders competing');
  });

  it.each(['CANCELLED', 'EXPIRED'] as const)('closes out a %s listing quietly', (status) => {
    const position = listingPosition(listing({ status }));
    expect(position.action).toBeNull();
    expect(position.needsAttention).toBe(false);
  });
});

describe('an offer as a position', () => {
  it('lets a standing offer be withdrawn', () => {
    const position = offerPosition(offer());
    expect(position.stage).toBe('Standing');
    expect(position.action?.kind).toBe('withdraw');
    expect(position.needsAttention).toBe(false);
  });

  /* The position this whole screen exists for. Refunds are pull, not push
     (flow 9), so an outbid hold sits earning nothing until somebody asks. */
  it.each(['SUPERSEDED', 'EXPIRED'] as const)('asks for a %s hold back', (status) => {
    const position = offerPosition(offer({ status }));
    expect(position.action?.kind).toBe('reclaim');
    expect(position.needsAttention).toBe(true);
    expect(position.figure).toEqual({ label: 'Held', value: 'AUD 4,000.00' });
  });

  it('leaves an accepted offer to the loan it became', () => {
    expect(positionOfOffer(offer({ status: 'ACCEPTED' }), now)).toBeNull();
  });

  /* "You lent" is false here. The offer lost, and the caption has to be able
     to say what actually happened rather than finish a fixed phrase. */
  it('says the money is held rather than lent when the offer was outbid', () => {
    expect(offerPosition(offer({ status: 'SUPERSEDED' })).caption).toBe(
      'Your money is still held, and earning nothing',
    );
  });

  it('names the item, not the listing it belongs to', () => {
    expect(offerPosition(offer()).itemDescription).toBe('Omega Speedmaster');
  });
});

describe('a loan the reader owes', () => {
  /* The table is borrowing only now, so "You borrowed" on every row was a
     word the reader could not use. The rate is the fact that varies. */
  it('says what rate it is running at', () => {
    expect(positionOfBorrowedLoan(loan(), now).caption).toBe('18.00% p.a.');
  });

  it('shows what settling today would cost', () => {
    const position = positionOfBorrowedLoan(loan(), now);
    expect(position.stage).toBe('Running');
    expect(position.figure).toEqual({ label: 'Owed today', value: 'AUD 4,059.17' });
    expect(position.action?.kind).toBe('repay');
  });

  it('does not raise a loan three weeks out', () => {
    expect(positionOfBorrowedLoan(loan(), now).needsAttention).toBe(false);
  });

  it('raises one inside the last day', () => {
    const maturesAt = new Date(now + maturityWarningMs - 1000).toISOString();
    expect(positionOfBorrowedLoan(loan({ maturesAt }), now).needsAttention).toBe(true);
  });

  it('says a loan past its date is in grace', () => {
    const maturesAt = new Date(now - oneDay).toISOString();
    const position = positionOfBorrowedLoan(loan({ maturesAt }), now);
    expect(position.stage).toBe('In grace');
    expect(position.needsAttention).toBe(true);
  });

  /* The one thing the notification kept getting wrong: it offered to collect
     an item the reader had already walked in and asked for. */
  describe('collecting the item', () => {
    it('asks for it back when nothing has been requested', () => {
      const position = positionOfBorrowedLoan(loan({ status: 'REPAID' }), now, null);
      expect(position.stage).toBe('Repaid');
      expect(position.action?.kind).toBe('collect');
      expect(position.needsAttention).toBe(true);
    });

    it.each(['REQUESTED', 'VERIFIED'] as const)('stops asking once the request is %s', (status) => {
      const position = positionOfBorrowedLoan(loan({ status: 'REPAID' }), now, status);
      expect(position.stage).toBe('Collection requested');
      expect(position.action).toBeNull();
      expect(position.needsAttention).toBe(false);
    });

    /* Still open, not history. Staff have the seal to break and the reader
       has a counter to walk up to; it is finished when the item is theirs. */
    it('keeps a requested collection in view', () => {
      expect(isOpen(positionOfBorrowedLoan(loan({ status: 'REPAID' }), now, 'REQUESTED'))).toBe(
        true,
      );
    });

    it('files it into history once it has been handed over', () => {
      const position = positionOfBorrowedLoan(loan({ status: 'REPAID' }), now, 'RELEASED');
      expect(position.stage).toBe('Collected');
      expect(position.needsAttention).toBe(false);
      expect(isOpen(position)).toBe(false);
    });
  });

  /* The item is back in their name and sitting in a vault. Nobody remembers
     that on their own. */
  it('tells a repaid borrower to go and collect the item', () => {
    const position = positionOfBorrowedLoan(loan({ status: 'REPAID' }), now);
    expect(position.action?.kind).toBe('collect');
    expect(position.needsAttention).toBe(true);
  });

  it('raises a default without offering an action the borrower does not have', () => {
    const position = positionOfBorrowedLoan(loan({ status: 'DEFAULTED' }), now);
    expect(position.action).toBeNull();
    expect(position.needsAttention).toBe(true);
  });
});

/* The numbers the table is built out of. Everything here is arithmetic on
   the loan plus the server's clock, so it is exactly testable. */
describe('what a loan is worth', () => {
  /* Thirty days into a sixty day term at 18.00% on 4,000.00. */
  const sixtyDays = loan({
    startedAt: '2026-08-01T12:00:00.000Z',
    maturesAt: '2026-09-30T12:00:00.000Z',
    graceEndsAt: '2026-10-07T12:00:00.000Z',
    accruedInterest: money('5917'),
  });

  /* Bare figures. The loan tables name the currency once in the column
     header, because twenty repetitions of "AUD" down a column pushed every
     amount onto two lines. */
  it('splits interest into what has accrued and what is still to come', () => {
    const metrics = positionOfBorrowedLoan(sixtyDays, now).metrics;
    expect(metrics?.currency).toBe('AUD');
    expect(metrics?.interestSoFar).toBe('59.17');
    expect(metrics?.interestToCome).toBe('59.18');
  });

  /* Two readings of one loan. The borrower is quoted what settling now
     costs; the lender is quoted what comes back if it runs to term. */
  it('settles a borrower at today and a lender at maturity', () => {
    expect(positionOfBorrowedLoan(sixtyDays, now).metrics?.settlement).toEqual({
      label: 'Owed today',
      value: 'AUD 4,059.17',
    });
    expect(positionOfLentLoan(sixtyDays, now).metrics?.settlement).toEqual({
      label: 'Value at maturity',
      value: 'AUD 4,118.35',
    });
  });

  /* Twenty two days of a sixty day term, which is 36.67 percent.

     The note counts the days out rather than only counting them down. A bar
     answers "roughly how far"; a borrower wants the denominator, and reading
     it off the length of a bar is not reading. */
  it('reports how far through the term it is, out of how many days', () => {
    const term = positionOfBorrowedLoan(sixtyDays, now).term;
    expect(term?.elapsedBasisPoints).toBe(3667);
    expect(term?.note).toBe('day 23 of 60');
    expect(term?.caption).toBe('38 days left');
  });

  /* Counted from one. The day a loan is drawn down is its first day. */
  it('calls the first day day one rather than day zero', () => {
    const justStarted = Date.parse('2026-08-01T12:00:00.000Z');
    expect(positionOfBorrowedLoan(sixtyDays, justStarted).term?.note).toBe('day 1 of 60');
  });

  /* The interest column draws the same reading as a bar. It comes from the
     two figures beside it and not from the clock, which matters: what has
     accrued is the server's own number, so a bar drawn from the browser's
     idea of the time could contradict the figure printed under it. */
  it('reports how much of the term interest has built up', () => {
    const metrics = positionOfBorrowedLoan(sixtyDays, now).metrics;
    /* 59.17 accrued of 118.35 over the whole term, which is just under half
       and is the share the two printed figures state. */
    expect(metrics?.interestFilledBasisPoints).toBe(4999);
  });

  it('shows an empty interest bar when nothing has accrued yet', () => {
    const fresh = loan({
      startedAt: '2026-08-01T12:00:00.000Z',
      maturesAt: '2026-09-30T12:00:00.000Z',
      graceEndsAt: '2026-10-07T12:00:00.000Z',
      accruedInterest: money('0'),
    });
    expect(positionOfBorrowedLoan(fresh, now).metrics?.interestFilledBasisPoints).toBe(0);
  });

  /* Interest stops at maturity (rule L1), so the bar stops there too. A
     share above ten thousand would paint a bill the borrower has not run
     up. */
  it('never fills the interest bar past the whole term', () => {
    const overrun = loan({
      startedAt: '2026-08-01T12:00:00.000Z',
      maturesAt: '2026-09-30T12:00:00.000Z',
      graceEndsAt: '2026-10-07T12:00:00.000Z',
      accruedInterest: money('99999999'),
    });
    expect(positionOfBorrowedLoan(overrun, now).metrics?.interestFilledBasisPoints).toBe(10_000);
  });

  /* Interest stops at maturity (rule L1). A bar that kept filling through
     grace would say the opposite of what the arithmetic does. */
  it('holds the bar full through grace rather than overflowing', () => {
    const inGrace = Date.parse('2026-10-03T12:00:00.000Z');
    const term = positionOfBorrowedLoan(sixtyDays, inGrace).term;
    expect(term?.elapsedBasisPoints).toBe(10_000);
    /* The term is spent, so the count sits at its end and grace is what is
       left to say. */
    expect(term?.note).toBe('day 60 of 60');
    expect(term?.caption).toBe('4 days of grace left');
  });

  it('says so once grace has run out', () => {
    const after = Date.parse('2026-10-20T12:00:00.000Z');
    const term = positionOfBorrowedLoan(sixtyDays, after).term;
    expect(term?.note).toBe('grace has run out');
    /* Nothing is left to count, so nothing is offered as a second line. */
    expect(term?.caption).toBeNull();
  });

  it('never fills the bar before the loan starts', () => {
    const before = Date.parse('2026-07-01T12:00:00.000Z');
    expect(positionOfBorrowedLoan(sixtyDays, before).term?.elapsedBasisPoints).toBe(0);
  });

  /* The server recomputes accrual against its own clock on every read, so a
     repaid loan reports a whole term rather than what was paid (Q-029).
     Showing that number would be showing a wrong one. */
  it('shows no interest figure once a loan is closed', () => {
    expect(positionOfBorrowedLoan(loan({ status: 'REPAID' }), now).metrics).toBeNull();
    expect(positionOfLentLoan(loan({ status: 'LIQUIDATED' }), now).metrics).toBeNull();
  });

  /* A defaulted loan is past maturity, so its accrual is frozen and correct.
     That one is worth showing. */
  it('keeps the figures on a defaulted loan, where accrual has stopped', () => {
    expect(positionOfLentLoan(loan({ status: 'DEFAULTED' }), now).metrics).not.toBeNull();
  });

  it('survives a term that makes no sense rather than dividing by zero', () => {
    const broken = loan({ maturesAt: loan().startedAt });
    expect(positionOfBorrowedLoan(broken, now).term?.elapsedBasisPoints).toBe(0);
    expect(positionOfBorrowedLoan(broken, now).metrics?.interestToCome).toBe('0.00');
  });
});

describe('a loan the reader is owed', () => {
  it('shows what it has earned so far', () => {
    const position = positionOfLentLoan(loan(), now);
    expect(position.stage).toBe('Earning');
    expect(position.figure).toEqual({ label: 'Earned so far', value: 'AUD 59.17' });
    expect(position.needsAttention).toBe(false);
  });

  /* Grace running out changes nothing on its own. The loan keeps saying it
     is running until a lender marks it, so the screen has to ask. */
  it('asks the lender to mark a loan whose grace has run out', () => {
    const graceEndsAt = new Date(now - oneDay).toISOString();
    const position = positionOfLentLoan(loan({ graceEndsAt }), now);
    expect(position.stage).toBe('Past grace');
    expect(position.action?.kind).toBe('default');
    expect(position.needsAttention).toBe(true);
  });

  it('leaves a loan inside its grace alone', () => {
    expect(positionOfLentLoan(loan(), now).action).toBeNull();
  });

  it('offers the collateral to the lender on a default', () => {
    const position = positionOfLentLoan(loan({ status: 'DEFAULTED' }), now);
    expect(position.action?.kind).toBe('claim');
    expect(position.needsAttention).toBe(true);
  });

  it('closes a repaid loan as settled', () => {
    expect(positionOfLentLoan(loan({ status: 'REPAID' }), now).stage).toBe('Settled');
  });
});

/* The two failures this model exists to prevent. */
describe('the model as a whole', () => {
  const everyPosition = [
    listingPosition(listing()),
    listingPosition(listing({ status: 'DRAFT' })),
    listingPosition(listing({ status: 'CANCELLED' })),
    offerPosition(offer()),
    offerPosition(offer({ status: 'SUPERSEDED' })),
    positionOfBorrowedLoan(loan(), now),
    positionOfBorrowedLoan(loan({ status: 'REPAID' }), now),
    positionOfBorrowedLoan(loan({ status: 'DEFAULTED' }), now),
    positionOfLentLoan(loan(), now),
    positionOfLentLoan(loan({ status: 'DEFAULTED' }), now),
    positionOfLentLoan(loan({ status: 'REPAID' }), now),
  ];

  it('never shows a stage in the shape the database stores it', () => {
    for (const position of everyPosition) {
      expect(position.stage).not.toMatch(screamingSnakeCase);
    }
  });

  /* One loan, two readers, two different things to do about it. This is the
     duplication the four old screens encoded as two route files. */
  it('reads one defaulted loan two ways depending on the side', () => {
    const defaulted = loan({ status: 'DEFAULTED' });
    const borrower = positionOfBorrowedLoan(defaulted, now);
    const lender = positionOfLentLoan(defaulted, now);

    expect(borrower.side).toBe('borrowing');
    expect(lender.side).toBe('lending');
    expect(borrower.action).toBeNull();
    expect(lender.action?.kind).toBe('claim');
    expect(borrower.figure?.label).not.toBe(lender.figure?.label);
  });

  /* The collision that would actually happen: one loan is a row on both
     sides of the same portfolio, so keying on the loan id alone would make
     React render one of them and drop the other. */
  it('keeps one loan apart from itself when it is read from both sides', () => {
    const shared = loan();
    expect(positionOfBorrowedLoan(shared, now).id).not.toBe(positionOfLentLoan(shared, now).id);
  });

  it('keeps a listing apart from an offer that shares its identifier', () => {
    const collidingOffer = offer({ id: 'L1' });
    expect(listingPosition(listing()).id).not.toBe(offerPosition(collidingOffer).id);
  });
});

/* The split the screen is built on: what is still running, and what is
   behind you. */
describe('open and closed', () => {
  it.each([
    ['a running loan', () => positionOfBorrowedLoan(loan(), now)],
    ['a listing taking offers', () => listingPosition(listing())],
    ['a standing offer', () => offerPosition(offer())],
    [
      'an outbid hold, which still has money in it',
      () => offerPosition(offer({ status: 'SUPERSEDED' })),
    ],
  ])('keeps %s open', (_name, build) => {
    expect(isOpen(build())).toBe(true);
  });

  it.each([
    ['a settled loan', () => positionOfLentLoan(loan({ status: 'REPAID' }), now)],
    ['a withdrawn offer', () => offerPosition(offer({ status: 'WITHDRAWN' }))],
    ['a cancelled listing', () => listingPosition(listing({ status: 'CANCELLED' }))],
    ['a sold loan', () => positionOfBorrowedLoan(loan({ status: 'LIQUIDATED' }), now)],
  ])('files %s into history', (_name, build) => {
    expect(isOpen(build())).toBe(false);
  });

  /* Finished as a loan, unfinished as an errand. Burying it under history
     would hide the only control that ends it. */
  it('keeps a repaid loan open while the item is still to be collected', () => {
    const repaid = positionOfBorrowedLoan(loan({ status: 'REPAID' }), now);
    expect(repaid.action?.kind).toBe('collect');
    expect(isOpen(repaid)).toBe(true);
  });
});

describe('how long is left', () => {
  it('counts a live listing down to its closing date', () => {
    const closes = new Date(now + 20 * oneDay).toISOString();
    const term = listingPosition(listing({ expiresAt: closes })).term;
    expect(term?.note).toBe('closes in 20 days');
    /* No bar. Neither a listing nor an offer records when it began, so a
       proportion would be drawn from a guess. */
    expect(term?.elapsedBasisPoints).toBeNull();
  });

  it('says a listing closes today rather than in zero days', () => {
    const closes = new Date(now + 60 * 60 * 1000).toISOString();
    expect(listingPosition(listing({ expiresAt: closes })).term?.note).toBe('closes today');
  });

  /* Every other column on a closed row shows a dash. The term did not, and
     read as a lowercase word in a row of uppercase statuses. */
  it('leaves no term on a closed position', () => {
    expect(positionOfBorrowedLoan(loan({ status: 'REPAID' }), now).term).toBeNull();
    expect(offerPosition(offer({ status: 'WITHDRAWN' })).term).toBeNull();
  });

  /* The status is what settles this, not the dates. A loan can be marked
     defaulted while its maturity date is still ahead. */
  it('says a defaulted loan is over whatever its dates say', () => {
    expect(positionOfLentLoan(loan({ status: 'DEFAULTED' }), now).term?.note).toBe(
      'term ended in default',
    );
  });
});

describe('the photograph', () => {
  it('points at the receipt it belongs to', () => {
    expect(positionOfBorrowedLoan(loan(), now).photographSrc).toBe('/api/v1/receipts/R1/photo');
    expect(offerPosition(offer()).photographSrc).toBe('/api/v1/receipts/R1/photo');
  });

  /* Null rather than a URL that answers not found. The row reserves the
     space either way, so nothing shifts when one loads. */
  it('asks for nothing when there is no photograph', () => {
    expect(positionOfBorrowedLoan(loan({ hasPhotograph: false }), now).photographSrc).toBeNull();
  });
});
