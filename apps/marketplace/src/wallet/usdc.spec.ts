import { describe, expect, it } from 'vitest';
import { formatUsdc } from './usdc';

describe('formatUsdc', () => {
  it('reads six-decimal base units as two decimal places', () => {
    expect(formatUsdc(1_500_000n, 6, 'en-US')).toBe('USDC 1.50');
    expect(formatUsdc(1_000_000n, 6, 'en-US')).toBe('USDC 1.00');
    expect(formatUsdc(0n, 6, 'en-US')).toBe('USDC 0.00');
  });

  it('groups the whole part', () => {
    expect(formatUsdc(1_234_560_000n, 6, 'en-US')).toBe('USDC 1,234.56');
  });

  it('truncates rather than rounds, so a balance is never overstated', () => {
    expect(formatUsdc(999_999n, 6, 'en-US')).toBe('USDC 0.99');
    expect(formatUsdc(1_999_999n, 6, 'en-US')).toBe('USDC 1.99');
  });
});
