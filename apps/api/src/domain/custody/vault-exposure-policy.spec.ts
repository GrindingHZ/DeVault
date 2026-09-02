import { describe, expect, it } from 'vitest';
import { Money, currencyOf } from '../shared/money';
import { assertWithinInsuredLimit } from './vault-exposure-policy';

const usd = currencyOf('USD');
const limit = Money.of(1_000_000n, usd);

describe('assertWithinInsuredLimit', () => {
  it('accepts exposure below the limit', () => {
    expect(
      assertWithinInsuredLimit(Money.of(400_000n, usd), Money.of(500_000n, usd), limit).ok,
    ).toBe(true);
  });

  it('accepts exposure exactly at the limit', () => {
    expect(
      assertWithinInsuredLimit(Money.of(400_000n, usd), Money.of(600_000n, usd), limit).ok,
    ).toBe(true);
  });

  it('rejects exposure one unit past the limit', () => {
    const result = assertWithinInsuredLimit(
      Money.of(400_000n, usd),
      Money.of(600_001n, usd),
      limit,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VAULT_INSURED_LIMIT_EXCEEDED');
    }
  });
});
