import { waterfallFixtures } from '@depawn/test-support';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { platformAccountIds } from '../ledger/platform-accounts';
import { accountIdOf } from '../shared/identifiers';
import { Money, currencyOf } from '../shared/money';
import type { Distribution } from '../shared/settlement-ref';
import { distributeLiquidationProceeds } from './liquidation-waterfall';

const usd = currencyOf('USD');
const recipients = {
  noteHolder: accountIdOf('LENDER-1'),
  borrower: accountIdOf('BORROWER-1'),
};

const liquidationFeeBasisPoints = 500;

function sumOf(distributions: readonly Distribution[]): bigint {
  return distributions.reduce((total, distribution) => total + distribution.amount.minorUnits, 0n);
}

function amountFor(distributions: readonly Distribution[], accountId: string): bigint {
  return distributions
    .filter((distribution) => distribution.accountId === accountId)
    .reduce((total, distribution) => total + distribution.amount.minorUnits, 0n);
}

/* The value cases live in packages/test-support/src/fixtures/waterfall.json and
   run below; what stays here is the shape and the property. */
describe('distributeLiquidationProceeds', () => {
  it('always carries the rounding line, even at zero', () => {
    const distributions = distributeLiquidationProceeds(
      Money.of(300_000n, usd),
      Money.of(250_000n, usd),
      recipients,
      liquidationFeeBasisPoints,
    );
    const rounding = distributions.filter(
      (distribution) => distribution.accountId === platformAccountIds.rounding,
    );
    expect(rounding).toHaveLength(1);
    expect(rounding[0]?.amount.minorUnits).toBe(0n);
  });

  /* The sum holding is nearly free, because the rounding line is computed as
     the difference. What is worth proving is that each recipient gets the
     share rule L7 promises, for every arrangement of sale, debt, and fee. */
  it('splits any sale against any debt by the waterfall rule', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (proceeds, owed, feeBasisPoints) => {
          const distributions = distributeLiquidationProceeds(
            Money.of(proceeds, usd),
            Money.of(owed, usd),
            recipients,
            feeBasisPoints,
          );

          const toLender = amountFor(distributions, 'LENDER-1');
          const fee = amountFor(distributions, platformAccountIds.feeRevenue);
          const surplus = amountFor(distributions, 'BORROWER-1');
          const rounding = amountFor(distributions, platformAccountIds.rounding);

          // The lender is paid first, capped by what the sale raised.
          expect(toLender).toBe(proceeds < owed ? proceeds : owed);
          const remainder = proceeds - toLender;
          // The fee is taken from what is left, truncated downwards.
          expect(fee).toBe((remainder * BigInt(feeBasisPoints)) / 10_000n);
          // Everything still standing goes back to the borrower.
          expect(surplus).toBe(remainder - fee);
          expect(rounding).toBe(0n);
          expect(sumOf(distributions)).toBe(proceeds);
          for (const distribution of distributions) {
            expect(distribution.amount.isNegative()).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('distributeLiquidationProceeds against the shared fixtures', () => {
  for (const fixture of waterfallFixtures) {
    it(fixture.name, () => {
      const distributions = distributeLiquidationProceeds(
        Money.of(BigInt(fixture.proceedsMinorUnits), usd),
        Money.of(BigInt(fixture.amountOwedMinorUnits), usd),
        recipients,
        fixture.liquidationFeeBasisPoints,
      );
      expect(amountFor(distributions, 'LENDER-1')).toBe(BigInt(fixture.expectedLenderMinorUnits));
      expect(amountFor(distributions, platformAccountIds.feeRevenue)).toBe(
        BigInt(fixture.expectedFeeMinorUnits),
      );
      expect(amountFor(distributions, 'BORROWER-1')).toBe(
        BigInt(fixture.expectedSurplusMinorUnits),
      );
      expect(amountFor(distributions, platformAccountIds.rounding)).toBe(
        BigInt(fixture.expectedRoundingMinorUnits),
      );
    });
  }
});
