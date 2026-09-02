import { describe, expect, it } from 'vitest';
import type { LoanResponse } from '@depawn/contracts';
import type { Position } from './position';
import { totalsOf } from './portfolio-summary';

const oneDay = 24 * 60 * 60 * 1000;

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: 'LN1',
    receiptId: 'R1',
    itemDescription: 'Omega Speedmaster',
    hasPhotograph: true,
    borrowerAccountId: 'ada',
    principal: { minorUnits: '400000', currency: 'USD' },
    annualPercentageRateBasisPoints: 1800,
    startedAt: '2026-08-01T12:00:00.000Z',
    maturesAt: '2026-08-31T12:00:00.000Z',
    graceEndsAt: '2026-09-07T12:00:00.000Z',
    lenderNoteHolderAccountId: 'gita',
    lenderNoteId: 'NOTE1',
    status: 'ACTIVE',
    accruedInterest: { minorUnits: '5917', currency: 'USD' },
    originationSettlementRef: {
      kind: 'ledger',
      reference: 'SR1',
      settledAt: '2026-08-01T12:00:00.000Z',
    },
    ...overrides,
  };
}

function attentionPosition(): Position {
  return {
    id: 'p1',
    side: 'lending',
    itemDescription: 'Gold bar',
    listingId: null,
    loanId: null,
    offerId: null,
    stage: 'Outbid',
    tone: 'warning',
    caption: 'Your money is still held, and earning nothing',
    figure: null,
    metrics: null,
    pending: null,
    term: null,
    photographSrc: null,
    amount: '2,500.00',
    action: { label: 'Reclaim funds', kind: 'reclaim' },
    needsAttention: true,
  };
}

/* 400000 minor units at 18.00% for thirty days, truncating on a 365 day
   year: 400000 * 1800 * 30 days / (10000 * one year) = 5917. */
const wholeTerm = 5917n;

const empty = { loans: [], positions: [], side: 'borrowing' as const };

describe('totalsOf', () => {
  it('totals nothing to zero rather than throwing', () => {
    const totals = totalsOf(empty);
    expect(totals.principalMinorUnits).toBe(0n);
    expect(totals.settlementMinorUnits).toBe(0n);
    expect(totals.currency).toBeNull();
  });

  it('adds up the principal at work', () => {
    const totals = totalsOf({ ...empty, loans: [loan(), loan({ id: 'LN2' })] });
    expect(totals.principalMinorUnits).toBe(800000n);
  });

  /* A repaid loan is history. Counting it would inflate the strip forever,
     and the strip is the one place a person looks to know how exposed they
     are. */
  it('leaves repaid loans out', () => {
    expect(totalsOf({ ...empty, loans: [loan({ status: 'REPAID' })] }).principalMinorUnits).toBe(
      0n,
    );
  });

  /* A defaulted loan is still money that has not come back. */
  it('keeps a defaulted loan in the totals', () => {
    expect(totalsOf({ ...empty, loans: [loan({ status: 'DEFAULTED' })] }).principalMinorUnits).toBe(
      400000n,
    );
  });

  it('splits interest into what has accrued and what is still to come', () => {
    const half = loan({ accruedInterest: { minorUnits: '2000', currency: 'USD' } });
    const totals = totalsOf({ ...empty, loans: [half] });
    expect(totals.interestSoFarMinorUnits).toBe(2000n);
    expect(totals.interestToComeMinorUnits).toBe(wholeTerm - 2000n);
  });

  /* Interest clamps at maturity (rule L1), so a loan past its date has
     already accrued its whole term and nothing is left to come. Subtracting
     naively would have produced a negative figure on screen. */
  it('never reports negative interest still to come', () => {
    const past = loan({ accruedInterest: { minorUnits: '99999', currency: 'USD' } });
    expect(totalsOf({ ...empty, loans: [past] }).interestToComeMinorUnits).toBe(0n);
  });

  /* The borrower settles at what has accrued so far. The lender is quoted
     the whole term, because that is what comes back if it runs to maturity.
     The same loan, two figures, and the side is what picks between them. */
  it('settles a borrower at today and a lender at maturity', () => {
    const half = loan({ accruedInterest: { minorUnits: '2000', currency: 'USD' } });
    const borrowing = totalsOf({ loans: [half], positions: [], side: 'borrowing' });
    const lending = totalsOf({ loans: [half], positions: [], side: 'lending' });
    expect(borrowing.settlementMinorUnits).toBe(402000n);
    expect(lending.settlementMinorUnits).toBe(400000n + wholeTerm);
  });

  it('stays exact past the safe integer range', () => {
    const huge = '9007199254740993';
    const totals = totalsOf({
      ...empty,
      loans: [
        loan({ principal: { minorUnits: huge, currency: 'USD' } }),
        loan({ id: 'LN2', principal: { minorUnits: huge, currency: 'USD' } }),
      ],
    });
    expect(totals.principalMinorUnits).toBe(BigInt(huge) * 2n);
  });

  it('counts what needs a person today', () => {
    expect(totalsOf({ ...empty, positions: [attentionPosition()] }).needsAttentionCount).toBe(1);
  });

  it('takes the currency from the loans it counted', () => {
    expect(totalsOf({ ...empty, loans: [loan()] }).currency).toBe('USD');
  });

  it('reports no currency when every loan was excluded', () => {
    expect(totalsOf({ ...empty, loans: [loan({ status: 'REPAID' })] }).currency).toBeNull();
  });

  it('ignores a loan with a term that makes no sense rather than dividing by it', () => {
    const broken = loan({ maturesAt: '2026-08-01T12:00:00.000Z' });
    expect(totalsOf({ ...empty, loans: [broken] }).interestToComeMinorUnits).toBe(0n);
  });

  /* Not exactly twice the thirty day figure. The division truncates once,
     over the whole span, so two thirty day terms lose a minor unit that one
     sixty day term keeps. Pinned because it looks like an error until you
     work it through, and somebody would otherwise "fix" the arithmetic. */
  it('scales the term interest with the length of the term', () => {
    const sixty = loan({
      maturesAt: new Date(Date.parse('2026-08-01T12:00:00.000Z') + 60 * oneDay).toISOString(),
      accruedInterest: { minorUnits: '0', currency: 'USD' },
    });
    const total = totalsOf({ ...empty, loans: [sixty] }).interestToComeMinorUnits;
    expect(total).toBe(11835n);
    expect(total).toBeGreaterThan(wholeTerm * 2n - 2n);
  });
});
