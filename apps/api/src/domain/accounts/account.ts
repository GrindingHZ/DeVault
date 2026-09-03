import type { AccountId } from '../shared/identifiers';

export type Role = 'MEMBER' | 'VAULT_STAFF' | 'OPERATIONS' | 'COMPLIANCE';

export class Account {
  private constructor(
    readonly id: AccountId,
    readonly email: string,
    readonly passwordHash: string,
    readonly roles: readonly Role[],
    readonly version: number,
    /* The Sui address a wallet signed in with, and the address this account's
       on-chain wallet is owned by. Null for a password account until it links
       one. */
    readonly walletAddress: string | null,
  ) {}

  static create(input: { id: AccountId; email: string; passwordHash: string }): Account {
    return new Account(
      input.id,
      input.email.toLowerCase(),
      input.passwordHash,
      ['MEMBER'],
      0,
      null,
    );
  }

  /* A member who arrived by signing a wallet challenge rather than a
     password. The address is the account's identity: it is the email, so
     the rest of the system needs no new lookup, and it is the wallet field,
     so the on-chain wallet is owned by the key that signed in. The password
     hash is a real hash of a value nobody holds, so password login can never
     match it. */
  static createForWallet(input: {
    id: AccountId;
    address: string;
    unusablePasswordHash: string;
    /* Derived from the custodian allowlist at sign in: a member for an ordinary
       wallet, vault staff for an authorised one. */
    roles: readonly Role[];
  }): Account {
    const address = input.address.toLowerCase();
    return new Account(input.id, address, input.unusablePasswordHash, input.roles, 0, address);
  }

  static restore(input: {
    id: AccountId;
    email: string;
    passwordHash: string;
    roles: readonly Role[];
    version: number;
    walletAddress: string | null;
  }): Account {
    return new Account(
      input.id,
      input.email,
      input.passwordHash,
      input.roles,
      input.version,
      input.walletAddress,
    );
  }

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  hasAnyRole(roles: readonly Role[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }
}
