import { describe, expect, it } from 'vitest';
import type { LoanResponse, MyListingResponse, MyOfferResponse } from '@depawn/contracts';
import { meaningOf, stagesFor, toneOf } from './stages';
import {
  positionOfBorrowedLoan,
  positionOfLentLoan,
  positionOfListing,
  positionOfOffer,
} from './position';
import type { Position } from './position';

const positionOfListing2 = (l: Parameters<typeof positionOfListing>[0]) =>
  positionOfListing(l, now);
const positionOfOffer2 = (o: Parameters<typeof positionOfOffer>[0]) => positionOfOffer(o, now);

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

const wellPast = Date.parse('2026-11-30T12:00:00.000Z');

/* Every branch of every mapper. If a new state is added and its stage is not
   in the legend, the type will refuse it, and if it is in the legend but on
   the wrong side, the coverage test below catches it. */
const everyPosition: readonly Position[] = [
  positionOfListing2(listing()),
  positionOfListing2(listing({ status: 'DRAFT' })),
  positionOfListing2(listing({ status: 'CANCELLED' })),
  positionOfListing2(listing({ status: 'EXPIRED' })),
  positionOfOffer2(offer()),
  positionOfOffer2(offer({ status: 'SUPERSEDED' })),
  positionOfOffer2(offer({ status: 'EXPIRED' })),
  positionOfOffer2(offer({ status: 'WITHDRAWN' })),
  positionOfBorrowedLoan(loan(), now),
  positionOfBorrowedLoan(loan(), wellPast),
  positionOfBorrowedLoan(loan({ status: 'REPAID' }), now),
  positionOfBorrowedLoan(loan({ status: 'DEFAULTED' }), now),
  positionOfBorrowedLoan(loan({ status: 'LIQUIDATED' }), now),
  positionOfLentLoan(loan(), now),
  positionOfLentLoan(loan(), wellPast),
  positionOfLentLoan(loan({ status: 'DEFAULTED' }), now),
  positionOfLentLoan(loan({ status: 'REPAID' }), now),
  positionOfLentLoan(loan({ status: 'LIQUIDATED' }), now),
].filter((one): one is Position => one !== null);

describe('the status legend', () => {
  /* The whole reason the vocabulary is a table rather than a pile of string
     literals. A legend missing a status is worse than no legend: it tells
     the reader they have seen all of them. */
  it('explains every stage a mapper can produce, from that side', () => {
    for (const position of everyPosition) {
      const meaning = meaningOf(position.stage, position.side);
      expect(meaning, `${position.side} has no meaning for ${position.stage}`).not.toBeNull();
      expect(meaning?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('lists every stage under the side a reader reaches it from', () => {
    for (const position of everyPosition) {
      const labels = stagesFor(position.side).map((entry) => entry.label);
      expect(labels).toContain(position.stage);
    }
  });

  /* The other direction. A stage nobody can reach is dead copy that will
     rot, and the legend would be promising a state the product cannot be
     in. */
  it.each(['borrowing', 'lending'] as const)('carries no unreachable %s stage', (side) => {
    const produced = new Set(
      everyPosition.filter((one) => one.side === side).map((one) => one.stage),
    );
    const unreachable = stagesFor(side)
      .map((entry) => entry.label)
      .filter((label) => !produced.has(label as never));
    expect(unreachable).toEqual([]);
  });

  it('gives every stage the tone its positions carry', () => {
    for (const position of everyPosition) {
      /* A loan due tomorrow is still "Running" and still warns, so a row may
         darken a stage's own tone. It must never brighten one. */
      if (position.tone !== 'warning') {
        expect(position.tone).toBe(toneOf(position.stage, position.side));
      }
    }
  });

  /* The same word from two ends. An item being sold costs the borrower the
     item and pays the lender out, and the legend has to say both. */
  it('reads a shared stage differently from each side', () => {
    expect(meaningOf('Sold', 'borrowing')).not.toBe(meaningOf('Sold', 'lending'));
    expect(toneOf('Sold', 'borrowing')).toBe('danger');
    expect(toneOf('Sold', 'lending')).toBe('neutral');
    expect(meaningOf('Defaulted', 'borrowing')).not.toBe(meaningOf('Defaulted', 'lending'));
  });
});
