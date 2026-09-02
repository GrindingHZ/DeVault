import { interestFixtures } from '@depawn/test-support';
import { describe, expect, it } from 'vitest';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { MILLISECONDS_PER_YEAR, calculateAccruedInterest } from './interest-calculator';

const usd = currencyOf('USD');
const startedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const oneDay = 24n * 60n * 60n * 1000n;
const maturesAt = startedAt.plusMilliseconds(30n * oneDay);

function interestAt(now: Instant, principal = Money.of(250_000n, usd), rate = 1_800): Money {
  return calculateAccruedInterest(principal, rate, startedAt, maturesAt, now);
}

/* The value cases live in packages/test-support/src/fixtures/interest.json and
   run below; what stays here is what a fixture cannot say. */
describe('calculateAccruedInterest', () => {
  it('accrues linearly through the term', () => {
    const tenDays = interestAt(startedAt.plusMilliseconds(10n * oneDay)).minorUnits;
    const twentyDays = interestAt(startedAt.plusMilliseconds(20n * oneDay)).minorUnits;
    expect(tenDays).toBeGreaterThan(0n);
    // Truncation can cost a minor unit, so the doubling is exact to within one.
    expect(twentyDays - tenDays * 2n).toBeLessThanOrEqual(1n);
    expect(twentyDays - tenDays * 2n).toBeGreaterThanOrEqual(-1n);
  });

  it('needs a wider integer than sixty four bits for a realistic term', () => {
    // Ten billion minor units at 2400 basis points for a year: the product
    // the fixture case divides passes far beyond a 64 bit integer, which is
    // why every step stays in bigint here and in u128 on chain.
    expect(10_000_000_000n * 2_400n * MILLISECONDS_PER_YEAR).toBeGreaterThan(2n ** 64n);
  });

  it('rejects a negative rate', () => {
    expect(() => interestAt(maturesAt, Money.of(1_000n, usd), -1)).toThrow(RangeError);
  });

  it('keeps the principal currency', () => {
    expect(interestAt(maturesAt).currency).toBe(usd);
  });
});

/* The same cases the Move module is tested against, from one file, so a
   disagreement between the two arithmetics shows up here rather than on
   chain (docs/06-testing.md, Phase 3 additions). */
describe('calculateAccruedInterest against the shared fixtures', () => {
  for (const fixture of interestFixtures) {
    it(fixture.name, () => {
      const interest = calculateAccruedInterest(
        Money.of(BigInt(fixture.principalMinorUnits), usd),
        fixture.annualPercentageRateBasisPoints,
        Instant.fromEpochMilliseconds(BigInt(fixture.startedAtMs)),
        Instant.fromEpochMilliseconds(BigInt(fixture.maturesAtMs)),
        Instant.fromEpochMilliseconds(BigInt(fixture.nowMs)),
      );
      expect(interest.minorUnits).toBe(BigInt(fixture.expectedInterestMinorUnits));
    });
  }
});
