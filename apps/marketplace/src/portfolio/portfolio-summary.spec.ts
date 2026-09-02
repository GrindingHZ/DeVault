import { describe, expect, it } from 'vitest';
import type { LoanResponse } from '@depawn/contracts';
import type { Position } from './position';
import { totalsOf } from './portfolio-summary';

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: 'LN1',
    receiptId: 'R1',
    itemDescription: 'Omega Speedmaster',
    borrowerAccountId: 'ada',
    principal: { minorUnits: '400000', currency: 'AUD' },
    annualPercentageRateBasisPoints: 1800,
    startedAt: '2026-08-01T12:00:00.000Z',
    maturesAt: '2026-09-30T12:00:00.000Z',
    graceEndsAt: '2026-10-07T12:00:00.000Z',
    lenderNoteHolderAccountId: 'gita',
    status: 'ACTIVE',
    accruedInterest: { minorUnits: '5917', currency: 'AUD' },
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
    figure: null,
    action: { label: 'Reclaim', kind: 'reclaim' },
    needsAttention: true,
  };
}

const empty = { borrowedLoans: [], lentLoans: [], positions: [] };

describe('totalsOf', () => {
  it('totals nothing to zero rather than throwing', () => {
    const totals = totalsOf(empty);
    expect(totals.borrowedMinorUnits).toBe(0n);
    expect(totals.owedTodayMinorUnits).toBe(0n);
    expect(totals.currency).toBeNull();
  });

  it('adds principal and accrued for what is owed today', () => {
    const totals = totalsOf({ ...empty, borrowedLoans: [loan(), loan({ id: 'LN2' })] });
    expect(totals.borrowedMinorUnits).toBe(800000n);
    expect(totals.owedTodayMinorUnits).toBe(811834n);
  });

  /* A repaid loan is history. Counting it would inflate both sides of the
     strip forever, and the strip is the one place a person looks to know how
     exposed they are. */
  it('leaves repaid loans out of both sides', () => {
    const totals = totalsOf({
      borrowedLoans: [loan({ status: 'REPAID' })],
      lentLoans: [loan({ status: 'REPAID' })],
      positions: [],
    });
    expect(totals.borrowedMinorUnits).toBe(0n);
    expect(totals.lentMinorUnits).toBe(0n);
  });

  /* A defaulted loan is still money that has not come back. */
  it('keeps a defaulted loan in the totals', () => {
    const totals = totalsOf({ ...empty, lentLoans: [loan({ status: 'DEFAULTED' })] });
    expect(totals.lentMinorUnits).toBe(400000n);
  });

  it('totals what has been lent and what it has earned', () => {
    const totals = totalsOf({ ...empty, lentLoans: [loan(), loan({ id: 'LN2' })] });
    expect(totals.lentMinorUnits).toBe(800000n);
    expect(totals.accruedMinorUnits).toBe(11834n);
  });

  it('stays exact past the safe integer range', () => {
    const huge = '9007199254740993';
    const totals = totalsOf({
      ...empty,
      borrowedLoans: [
        loan({ principal: { minorUnits: huge, currency: 'AUD' } }),
        loan({ id: 'LN2', principal: { minorUnits: huge, currency: 'AUD' } }),
      ],
    });
    expect(totals.borrowedMinorUnits).toBe(BigInt(huge) * 2n);
  });

  it('counts what needs a person today', () => {
    const totals = totalsOf({ ...empty, positions: [attentionPosition()] });
    expect(totals.needsAttentionCount).toBe(1);
  });

  it('takes the currency from whichever side has anything', () => {
    expect(totalsOf({ ...empty, lentLoans: [loan()] }).currency).toBe('AUD');
  });
});
