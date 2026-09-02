import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money, currencyOf } from './money';

/* Two currencies on purpose. The product trades in one, and half the
   assertions below exist to prove that arithmetic across two is refused, so
   the second code has to stay genuinely different: a search and replace over
   the product currency once collapsed these into the same value and every
   mismatch test passed by testing nothing. */
const usd = currencyOf('USD');
const eur = currencyOf('EUR');

describe('Money', () => {
  it('adds amounts of the same currency', () => {
    const sum = Money.of(1500n, usd).plus(Money.of(2500n, usd));
    expect(sum.minorUnits).toBe(4000n);
    expect(sum.currency).toBe(usd);
  });

  it('subtracts amounts of the same currency', () => {
    const difference = Money.of(2500n, usd).minus(Money.of(1500n, usd));
    expect(difference.minorUnits).toBe(1000n);
  });

  it('throws on arithmetic across currencies', () => {
    expect(() => Money.of(100n, usd).plus(Money.of(100n, eur))).toThrow(CurrencyMismatchError);
    expect(() => Money.of(100n, usd).minus(Money.of(100n, eur))).toThrow(CurrencyMismatchError);
    expect(() => Money.of(100n, usd).isGreaterThan(Money.of(100n, eur))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => Money.of(100n, usd).isLessThan(Money.of(100n, eur))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('multiplies by basis points with truncating division', () => {
    expect(Money.of(250_000n, usd).multiplyByBasisPoints(200).minorUnits).toBe(5000n);
    expect(Money.of(999n, usd).multiplyByBasisPoints(1).minorUnits).toBe(0n);
    expect(Money.of(10_001n, usd).multiplyByBasisPoints(50).minorUnits).toBe(50n);
  });

  it('rejects negative or fractional basis points', () => {
    expect(() => Money.of(100n, usd).multiplyByBasisPoints(-1)).toThrow(RangeError);
    expect(() => Money.of(100n, usd).multiplyByBasisPoints(2.5)).toThrow(RangeError);
  });

  it('does not overflow on large principals', () => {
    const large = Money.of(10_000_000_000n, usd);
    expect(large.multiplyByBasisPoints(4800).minorUnits).toBe(4_800_000_000n);
  });

  it('compares amounts of the same currency', () => {
    expect(Money.of(200n, usd).isGreaterThan(Money.of(100n, usd))).toBe(true);
    expect(Money.of(100n, usd).isLessThan(Money.of(200n, usd))).toBe(true);
    expect(Money.of(100n, usd).equals(Money.of(100n, usd))).toBe(true);
    expect(Money.of(100n, usd).equals(Money.of(100n, eur))).toBe(false);
  });

  it('recognises zero and negative amounts', () => {
    expect(Money.zero(usd).isZero()).toBe(true);
    expect(Money.of(1n, usd).isZero()).toBe(false);
    expect(Money.of(-1n, usd).isNegative()).toBe(true);
    expect(Money.zero(usd).isNegative()).toBe(false);
  });
});
