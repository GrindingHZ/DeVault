import { interestOver } from '@depawn/ui';
import { describe, expect, it } from 'vitest';
import {
  borrowerStanding,
  lenderStanding,
  pledgeStatusOf,
  summarizeWallet,
} from './wallet-money';
import type { PledgeTerms } from './wallet-money';

const day = 24 * 60 * 60 * 1000;
const started = 1_700_000_000_000;
const matures = started + 30 * day;

function terms(overrides: Partial<PledgeTerms> = {}): PledgeTerms {
  return {
    pledgeId: '0xpledge',
    status: 'active',
    principalBaseUnits: 1_000_000_000n,
    aprBps: 3600,
    startedAtMs: started,
    maturesAtMs: matures,
    gracePeriodMs: 7 * day,
    parkedBaseUnits: 0n,
    ...overrides,
  };
}

describe('pledgeStatusOf', () => {
  it('names the contract status byte', () => {
    expect(pledgeStatusOf(0)).toBe('open');
    expect(pledgeStatusOf(1)).toBe('active');
    expect(pledgeStatusOf(2)).toBe('repaid');
    expect(pledgeStatusOf(3)).toBe('defaulted');
  });
});

describe('lenderStanding', () => {
  it('carries principal and accrues interest on an active loan', () => {
    const now = started + 10 * day;
    const standing = lenderStanding(terms(), now);
    const expectedEarned = interestOver('1000000000', 3600, 10 * day);
    const expectedFullTerm = interestOver('1000000000', 3600, 30 * day);
    expect(standing.principalBaseUnits).toBe(1_000_000_000n);
    expect(standing.earnedSoFarBaseUnits).toBe(expectedEarned);
    expect(standing.valueAtMaturityBaseUnits).toBe(1_000_000_000n + expectedFullTerm);
    expect(standing.collectableBaseUnits).toBe(0n);
  });

  it('stops interest at maturity', () => {
    const wellPastMaturity = matures + 100 * day;
    const standing = lenderStanding(terms(), wellPastMaturity);
    expect(standing.earnedSoFarBaseUnits).toBe(interestOver('1000000000', 3600, 30 * day));
  });

  it('reports the parked payoff as collectable once repaid', () => {
    const standing = lenderStanding(
      terms({ status: 'repaid', parkedBaseUnits: 1_029_589_041n }),
      matures,
    );
    expect(standing.collectableBaseUnits).toBe(1_029_589_041n);
    expect(standing.principalBaseUnits).toBe(0n);
    expect(standing.earnedSoFarBaseUnits).toBe(0n);
  });

  it('pays no cash on a defaulted loan', () => {
    const standing = lenderStanding(terms({ status: 'defaulted' }), matures + 8 * day);
    expect(standing.principalBaseUnits).toBe(0n);
    expect(standing.collectableBaseUnits).toBe(0n);
    expect(standing.valueAtMaturityBaseUnits).toBe(0n);
  });
});

describe('borrowerStanding', () => {
  it('owes principal plus accrued interest, and knows the grace cliff', () => {
    const now = started + 10 * day;
    const standing = borrowerStanding(terms(), now);
    const expectedNow = 1_000_000_000n + interestOver('1000000000', 3600, 10 * day);
    const expectedMaturity = 1_000_000_000n + interestOver('1000000000', 3600, 30 * day);
    expect(standing.owedNowBaseUnits).toBe(expectedNow);
    expect(standing.owedAtMaturityBaseUnits).toBe(expectedMaturity);
    expect(standing.graceEndsAtMs).toBe(matures + 7 * day);
  });

  it('owes nothing once the loan is no longer active', () => {
    const standing = borrowerStanding(terms({ status: 'repaid' }), matures);
    expect(standing.owedNowBaseUnits).toBe(0n);
    expect(standing.principalBaseUnits).toBe(0n);
  });
});

describe('summarizeWallet', () => {
  it('sums the bands and counts collectable as controlled cash', () => {
    const now = started + 10 * day;
    const totals = summarizeWallet({
      availableBaseUnits: 500_000_000n,
      lender: [
        lenderStanding(terms({ pledgeId: '0xa' }), now),
        lenderStanding(terms({ pledgeId: '0xb', status: 'repaid', parkedBaseUnits: 200_000_000n }), now),
      ],
      borrower: [borrowerStanding(terms({ pledgeId: '0xc' }), now)],
    });
    expect(totals.availableBaseUnits).toBe(500_000_000n);
    expect(totals.lentPrincipalBaseUnits).toBe(1_000_000_000n);
    expect(totals.collectableBaseUnits).toBe(200_000_000n);
    expect(totals.cashControlledBaseUnits).toBe(700_000_000n);
    expect(totals.owedNowBaseUnits).toBe(1_000_000_000n + interestOver('1000000000', 3600, 10 * day));
  });
});
