import { describe, expect, it } from 'vitest';
import type { LoanResponse, MyListingResponse, MyOfferResponse } from '@depawn/contracts';
import {
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
    ...overrides,
  };
}

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: 'LN1',
    receiptId: 'R1',
    itemDescription: 'Omega Speedmaster',
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

describe('a listing as a position', () => {
  it('offers to publish a draft', () => {
    const position = positionOfListing(listing({ status: 'DRAFT' }));
    expect(position.stage).toBe('Draft');
    expect(position.action?.kind).toBe('publish');
    expect(position.needsAttention).toBe(false);
  });

  it('shows the best offer on a live listing', () => {
    const position = positionOfListing(listing());
    expect(position.stage).toBe('Taking offers');
    expect(position.figure).toEqual({ label: 'Best offer', value: '11.00%' });
    expect(position.action?.kind).toBe('accept');
  });

  it('says there is no offer yet rather than showing a rate of nothing', () => {
    const position = positionOfListing(listing({ bestOfferRateBasisPoints: null, offerCount: 0 }));
    expect(position.figure?.value).toBe('none yet');
  });

  /* A button that opens an empty book is a button that wasted a click. */
  it('offers nothing to accept when nobody has offered', () => {
    expect(positionOfListing(listing({ offerCount: 0 })).action).toBeNull();
  });

  it('reads a matched listing as funded', () => {
    const position = positionOfListing(listing({ status: 'MATCHED' }));
    expect(position.stage).toBe('Funded');
    expect(position.action).toBeNull();
  });

  it.each(['CANCELLED', 'EXPIRED'] as const)('closes out a %s listing quietly', (status) => {
    const position = positionOfListing(listing({ status }));
    expect(position.action).toBeNull();
    expect(position.needsAttention).toBe(false);
  });
});

describe('an offer as a position', () => {
  it('lets a standing offer be withdrawn', () => {
    const position = positionOfOffer(offer());
    expect(position.stage).toBe('Standing');
    expect(position.action?.kind).toBe('withdraw');
    expect(position.needsAttention).toBe(false);
  });

  /* The position this whole screen exists for. Refunds are pull, not push
     (flow 9), so an outbid hold sits earning nothing until somebody asks. */
  it.each(['SUPERSEDED', 'EXPIRED'] as const)('asks for a %s hold back', (status) => {
    const position = positionOfOffer(offer({ status }));
    expect(position.action?.kind).toBe('reclaim');
    expect(position.needsAttention).toBe(true);
    expect(position.figure).toEqual({ label: 'Held', value: 'AUD 4,000.00' });
  });

  it('leaves an accepted offer alone', () => {
    const position = positionOfOffer(offer({ status: 'ACCEPTED' }));
    expect(position.action).toBeNull();
    expect(position.needsAttention).toBe(false);
  });

  it('names the item, not the listing it belongs to', () => {
    expect(positionOfOffer(offer()).itemDescription).toBe('Omega Speedmaster');
  });
});

describe('a loan the reader owes', () => {
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

describe('a loan the reader is owed', () => {
  it('shows what it has earned so far', () => {
    const position = positionOfLentLoan(loan());
    expect(position.stage).toBe('Earning');
    expect(position.figure).toEqual({ label: 'Accrued', value: 'AUD 59.17' });
    expect(position.needsAttention).toBe(false);
  });

  it('offers the collateral to the lender on a default', () => {
    const position = positionOfLentLoan(loan({ status: 'DEFAULTED' }));
    expect(position.action?.kind).toBe('claim');
    expect(position.needsAttention).toBe(true);
  });

  it('closes a repaid loan as settled', () => {
    expect(positionOfLentLoan(loan({ status: 'REPAID' })).stage).toBe('Settled');
  });
});

/* The two failures this model exists to prevent. */
describe('the model as a whole', () => {
  const everyPosition = [
    positionOfListing(listing()),
    positionOfListing(listing({ status: 'DRAFT' })),
    positionOfListing(listing({ status: 'MATCHED' })),
    positionOfListing(listing({ status: 'CANCELLED' })),
    positionOfOffer(offer()),
    positionOfOffer(offer({ status: 'SUPERSEDED' })),
    positionOfOffer(offer({ status: 'ACCEPTED' })),
    positionOfBorrowedLoan(loan(), now),
    positionOfBorrowedLoan(loan({ status: 'REPAID' }), now),
    positionOfBorrowedLoan(loan({ status: 'DEFAULTED' }), now),
    positionOfLentLoan(loan()),
    positionOfLentLoan(loan({ status: 'DEFAULTED' })),
    positionOfLentLoan(loan({ status: 'REPAID' })),
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
    const lender = positionOfLentLoan(defaulted);

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
    expect(positionOfBorrowedLoan(shared, now).id).not.toBe(positionOfLentLoan(shared).id);
  });

  it('keeps a listing apart from an offer that shares its identifier', () => {
    const collidingOffer = offer({ id: 'L1' });
    expect(positionOfListing(listing()).id).not.toBe(positionOfOffer(collidingOffer).id);
  });
});
