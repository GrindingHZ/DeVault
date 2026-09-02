import { isValidSuiAddress } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';
import { accountIdOf } from '../../domain/shared/identifiers';
import { deriveAccountAddress } from './account-address.directory';

const seed = 'ab'.repeat(32);

describe('deriveAccountAddress', () => {
  it('always answers the same address for the same account', () => {
    expect(deriveAccountAddress(seed, accountIdOf('01ACCOUNT'))).toBe(
      deriveAccountAddress(seed, accountIdOf('01ACCOUNT')),
    );
  });

  it('answers a different address for a different account or seed', () => {
    const address = deriveAccountAddress(seed, accountIdOf('01ACCOUNT'));
    expect(deriveAccountAddress(seed, accountIdOf('02ACCOUNT'))).not.toBe(address);
    expect(deriveAccountAddress('cd'.repeat(32), accountIdOf('01ACCOUNT'))).not.toBe(address);
  });

  it('answers a well formed sui address', () => {
    expect(isValidSuiAddress(deriveAccountAddress(seed, accountIdOf('01ACCOUNT')))).toBe(true);
  });
});
