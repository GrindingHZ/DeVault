import { describe, expect, it } from 'vitest';
import { interestOver, rateToBasisPoints, standingAmong } from './interest';

const thirtyDays = 30 * 24 * 60 * 60 * 1000;

describe('interestOver', () => {
  /* The whole reason this exists: it must agree with rankOffers in the
     domain. Same bigint arithmetic, same truncation, same 365 day year. A
     preview that disagreed would quote a lender a return they never get. */
  it('matches the server formula', () => {
    const expected =
      (400000n * 1800n * BigInt(thirtyDays)) / (10_000n * 365n * 24n * 60n * 60n * 1000n);
    expect(interestOver('400000', 1800, thirtyDays)).toBe(expected);
  });

  it('stays exact well past the safe integer range', () => {
    const principal = '9007199254740993';
    expect(interestOver(principal, 1800, thirtyDays)).toBe(
      (BigInt(principal) * 1800n * BigInt(thirtyDays)) / (10_000n * 365n * 24n * 60n * 60n * 1000n),
    );
  });

  /* Truncating, which rounds in the borrower's favour, the same direction as
     accrual. Asserted so nobody "fixes" it later. */
  it('truncates rather than rounding up', () => {
    expect(interestOver('1', 1, 1000)).toBe(0n);
  });

  it('earns nothing at no rate or no time', () => {
    expect(interestOver('400000', 0, thirtyDays)).toBe(0n);
    expect(interestOver('400000', 1800, 0)).toBe(0n);
  });
});

describe('rateToBasisPoints', () => {
  it('reads the shapes a person types', () => {
    expect(rateToBasisPoints('18')).toBe(1800);
    expect(rateToBasisPoints('18.5')).toBe(1850);
    expect(rateToBasisPoints('18.50')).toBe(1850);
    expect(rateToBasisPoints(' 7.25 ')).toBe(725);
  });

  /* A field halfway through being filled in is the normal state of a field,
     not an error to shout about. */
  it('answers null for anything that is not a rate yet', () => {
    expect(rateToBasisPoints('')).toBeNull();
    expect(rateToBasisPoints('18.')).toBeNull();
    expect(rateToBasisPoints('18.555')).toBeNull();
    expect(rateToBasisPoints('eighteen')).toBeNull();
    expect(rateToBasisPoints('-4')).toBeNull();
  });
});

describe('standingAmong', () => {
  it('reads an empty book as the best offer', () => {
    expect(standingAmong(1800, [])).toEqual({ position: 1, total: 1, isBest: true });
  });

  it('places a cheaper rate in front', () => {
    expect(standingAmong(1000, [1800, 2000])).toEqual({ position: 1, total: 3, isBest: true });
  });

  it('places a dearer rate behind', () => {
    expect(standingAmong(2400, [1800, 2000])).toEqual({ position: 3, total: 3, isBest: false });
  });

  /* Matching the best is not beating it, and saying otherwise would be a
     small lie at exactly the moment somebody commits money. */
  it('puts a tie behind the offer already standing', () => {
    expect(standingAmong(1800, [1800])).toEqual({ position: 2, total: 2, isBest: false });
  });
});
