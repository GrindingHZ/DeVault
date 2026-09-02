import { describe, expect, it } from 'vitest';
import type { LedgerEntryResponse, LoanResponse } from '@depawn/contracts';
import { buildCapitalSeries, changeOver, reconcilesWith } from './capital-series';

const oneDay = 24 * 60 * 60 * 1000;
const day0 = Date.parse('2026-08-01T00:00:00.000Z');

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: 'entry-1',
    kind: 'DEPOSIT',
    direction: 'CREDIT',
    purpose: 'USER_AVAILABLE',
    amount: { minorUnits: '1000000', currency: 'USD' },
    occurredAt: new Date(day0).toISOString(),
    reference: 'ref-1',
    ...overrides,
  };
}

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: 'loan-1',
    receiptId: 'receipt-1',
    itemDescription: 'Omega Watch',
    hasPhotograph: false,
    borrowerAccountId: 'borrower-1',
    principal: { minorUnits: '400000', currency: 'USD' },
    annualPercentageRateBasisPoints: 1200,
    startedAt: new Date(day0 + 2 * oneDay).toISOString(),
    maturesAt: new Date(day0 + 32 * oneDay).toISOString(),
    graceEndsAt: new Date(day0 + 39 * oneDay).toISOString(),
    lenderNoteHolderAccountId: 'lender-1',
    status: 'ACTIVE',
    accruedInterest: { minorUnits: '0', currency: 'USD' },
    originationSettlementRef: { kind: 'ledger', reference: 'ref', settledAt: '' },
    ...overrides,
  };
}

describe('replaying the ledger', () => {
  /* Money in is a credit to the reader and money out is a debit, which is the
     way the wallet already renders the pair. Getting this backwards would
     draw every balance upside down. */
  it('adds a credit and subtracts a debit', () => {
    const points = buildCapitalSeries({
      entries: [
        entry({ id: 'a', direction: 'CREDIT', amount: { minorUnits: '1000000', currency: 'USD' } }),
        entry({
          id: 'b',
          kind: 'WITHDRAW',
          direction: 'DEBIT',
          amount: { minorUnits: '250000', currency: 'USD' },
          occurredAt: new Date(day0 + oneDay).toISOString(),
        }),
      ],
      loans: [],
      asOfMs: day0 + 2 * oneDay,
      windowMs: null,
    });
    expect(points[points.length - 1]?.cashMinorUnits).toBe(750000n);
  });

  it('reads the entries in time order however they arrive', () => {
    const newestFirst = [
      entry({
        id: 'b',
        kind: 'WITHDRAW',
        direction: 'DEBIT',
        amount: { minorUnits: '250000', currency: 'USD' },
        occurredAt: new Date(day0 + oneDay).toISOString(),
      }),
      entry({ id: 'a', direction: 'CREDIT' }),
    ];
    const points = buildCapitalSeries({
      entries: newestFirst,
      loans: [],
      asOfMs: day0 + 2 * oneDay,
      windowMs: null,
    });
    expect(points[points.length - 1]?.cashMinorUnits).toBe(750000n);
  });

  /* The guarantee that makes replaying trustworthy at all. */
  it('agrees with the balance the server reports', () => {
    const entries = [
      entry({ id: 'a', direction: 'CREDIT' }),
      entry({
        id: 'b',
        kind: 'HOLD_FUNDS',
        direction: 'DEBIT',
        purpose: 'USER_AVAILABLE',
        amount: { minorUnits: '300000', currency: 'USD' },
      }),
      entry({
        id: 'c',
        kind: 'HOLD_FUNDS',
        direction: 'CREDIT',
        purpose: 'USER_HELD',
        amount: { minorUnits: '300000', currency: 'USD' },
      }),
    ];
    expect(reconcilesWith(entries, '700000', '300000')).toBe(true);
  });

  /* The browser holds pages of entries, not all of them. A short page has to
     announce itself rather than draw a line that quietly starts too late. */
  it('says so when the entries it holds do not add up to the balance', () => {
    const onlyOnePage = [entry({ direction: 'CREDIT' })];
    expect(reconcilesWith(onlyOnePage, '700000', '300000')).toBe(true);
    expect(reconcilesWith(onlyOnePage, '700000', '400000')).toBe(false);
  });
});

describe('what a lender is worth', () => {
  const funded = entry({ id: 'deposit', direction: 'CREDIT' });
  const originated = entry({
    id: 'origination',
    kind: 'ORIGINATE_LOAN',
    direction: 'DEBIT',
    purpose: 'USER_HELD',
    amount: { minorUnits: '400000', currency: 'USD' },
    occurredAt: new Date(day0 + 2 * oneDay).toISOString(),
    reference: 'loan-1',
  });

  /* The whole argument for this chart. Lending is not a loss, and a total
     that fell when money went out would say it was. */
  it('does not fall when cash is lent out', () => {
    const points = buildCapitalSeries({
      entries: [funded, originated],
      loans: [loan()],
      asOfMs: day0 + 2 * oneDay,
      windowMs: null,
    });
    const before = points[0]?.totalMinorUnits ?? 0n;
    const after = points[points.length - 1]?.totalMinorUnits ?? 0n;
    expect(after).toBeGreaterThanOrEqual(before);
    /* Cash did fall. The point is that the total did not. */
    expect(points[points.length - 1]?.cashMinorUnits).toBe(600000n);
    expect(points[points.length - 1]?.lentMinorUnits).toBe(400000n);
  });

  it('rises as the interest accrues, on a day nobody did anything', () => {
    const points = buildCapitalSeries({
      entries: [funded, originated],
      loans: [loan()],
      asOfMs: day0 + 20 * oneDay,
      windowMs: null,
    });
    const totals = points.map((point) => point.totalMinorUnits);
    const closing = totals[totals.length - 1] ?? 0n;
    expect(closing).toBeGreaterThan(totals[0] ?? 0n);
    expect(points[points.length - 1]?.interestMinorUnits).toBeGreaterThan(0n);
  });

  /* Rule L1. A note that kept earning past its term would quote a lender a
     return they do not get. */
  it('stops the accrual at maturity', () => {
    const atMaturity = buildCapitalSeries({
      entries: [funded, originated],
      loans: [loan()],
      asOfMs: day0 + 32 * oneDay,
      windowMs: null,
    });
    const wellPast = buildCapitalSeries({
      entries: [funded, originated],
      loans: [loan()],
      asOfMs: day0 + 60 * oneDay,
      windowMs: null,
    });
    const first = atMaturity[atMaturity.length - 1]?.interestMinorUnits;
    const second = wellPast[wellPast.length - 1]?.interestMinorUnits;
    expect(second).toBe(first);
  });

  /* A repaid loan is money back in the wallet. Counting the note as well
     would pay the reader twice, which is the failure a chart built from two
     sources is most likely to have. */
  it('stops counting a note once the repayment lands', () => {
    const repaid = entry({
      id: 'repayment',
      kind: 'REPAY_LOAN',
      direction: 'CREDIT',
      purpose: 'USER_AVAILABLE',
      amount: { minorUnits: '403945', currency: 'USD' },
      occurredAt: new Date(day0 + 32 * oneDay).toISOString(),
      reference: 'loan-1',
    });
    const points = buildCapitalSeries({
      entries: [funded, originated, repaid],
      loans: [loan({ status: 'REPAID' })],
      asOfMs: day0 + 40 * oneDay,
      windowMs: null,
    });
    const closing = points[points.length - 1];
    expect(closing?.lentMinorUnits).toBe(0n);
    expect(closing?.interestMinorUnits).toBe(0n);
    /* Deposit, less the principal that went out, plus principal and interest
       coming back. Counted once. */
    expect(closing?.totalMinorUnits).toBe(1000000n - 400000n + 403945n);
  });

  it('ignores a loan that had not started yet', () => {
    const points = buildCapitalSeries({
      entries: [funded],
      loans: [loan({ startedAt: new Date(day0 + 10 * oneDay).toISOString() })],
      asOfMs: day0 + 1 * oneDay,
      windowMs: null,
    });
    expect(points[points.length - 1]?.lentMinorUnits).toBe(0n);
  });

  /* A borrower holds no notes, so their total is their cash and the chart
     degrades to the honest thing rather than to an empty one. */
  it('gives a borrower their cash and nothing invented', () => {
    const points = buildCapitalSeries({
      entries: [funded],
      loans: [],
      asOfMs: day0 + 5 * oneDay,
      windowMs: null,
    });
    expect(points[points.length - 1]?.totalMinorUnits).toBe(1000000n);
  });
});

describe('the window', () => {
  const entries = [
    entry({ id: 'a', direction: 'CREDIT', occurredAt: new Date(day0).toISOString() }),
  ];

  it('always ends at the moment the server answered', () => {
    const asOfMs = day0 + 45 * oneDay;
    const points = buildCapitalSeries({ entries, loans: [], asOfMs, windowMs: 7 * oneDay });
    expect(points[points.length - 1]?.atMs).toBe(asOfMs);
  });

  it('starts where the account does when the window is older than the account', () => {
    const points = buildCapitalSeries({
      entries,
      loans: [],
      asOfMs: day0 + 3 * oneDay,
      windowMs: 365 * oneDay,
    });
    expect(points[0]?.atMs).toBe(day0);
  });

  it('draws a shorter window from inside the account history', () => {
    const asOfMs = day0 + 45 * oneDay;
    const points = buildCapitalSeries({ entries, loans: [], asOfMs, windowMs: 7 * oneDay });
    expect(points[0]?.atMs).toBe(asOfMs - 7 * oneDay);
  });

  it('has nothing to draw for an account with no movements', () => {
    expect(buildCapitalSeries({ entries: [], loans: [], asOfMs: day0, windowMs: null })).toEqual(
      [],
    );
  });
});

describe('changeOver', () => {
  it('reports the movement across the window it was given', () => {
    const points = buildCapitalSeries({
      entries: [
        entry({ id: 'a', direction: 'CREDIT' }),
        entry({
          id: 'b',
          direction: 'CREDIT',
          amount: { minorUnits: '500000', currency: 'USD' },
          occurredAt: new Date(day0 + 3 * oneDay).toISOString(),
        }),
      ],
      loans: [],
      asOfMs: day0 + 5 * oneDay,
      windowMs: null,
    });
    const change = changeOver(points);
    expect(change?.openingMinorUnits).toBe(1000000n);
    expect(change?.closingMinorUnits).toBe(1500000n);
    expect(change?.deltaMinorUnits).toBe(500000n);
  });

  it('has nothing to say about an empty series', () => {
    expect(changeOver([])).toBeNull();
  });
});
