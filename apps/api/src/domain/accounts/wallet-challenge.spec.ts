import { describe, expect, it } from 'vitest';
import { accountIdOf } from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { WalletChallenge } from './wallet-challenge';

const issuedAt = Instant.fromEpochMilliseconds(1_000n);
const expiresAt = Instant.fromEpochMilliseconds(301_000n);

function challenge(): WalletChallenge {
  return WalletChallenge.issue({
    id: accountIdOf('01CHAL'),
    nonce: 'abcdef',
    address: '0xABCDEF',
    expiresAt,
  });
}

describe('WalletChallenge', () => {
  it('lowercases the address and names the product and nonce in the message', () => {
    const message = challenge().message();
    expect(message).toContain('DeVault');
    expect(message).toContain('0xabcdef');
    expect(message).toContain('abcdef');
  });

  it('can be spent once, inside its window', () => {
    const spent = challenge().spend(issuedAt);
    expect(spent.ok).toBe(true);
    if (spent.ok) {
      expect(spent.value.usedAt?.equals(issuedAt)).toBe(true);
    }
  });

  it('refuses a spend after expiry', () => {
    const late = challenge().spend(Instant.fromEpochMilliseconds(301_001n));
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.error.code).toBe('WALLET_CHALLENGE_EXPIRED');
    }
  });

  it('refuses a second spend', () => {
    const first = challenge().spend(issuedAt);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = first.value.spend(issuedAt);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.code).toBe('WALLET_CHALLENGE_USED');
      }
    }
  });
});
