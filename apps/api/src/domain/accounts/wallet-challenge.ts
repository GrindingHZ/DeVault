import type { AccountId } from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { WalletChallengeExpired } from './wallet-challenge-expired';
import { WalletChallengeUsed } from './wallet-challenge-used';

/* A nonce a wallet proves control of an address by signing. It is single
   use and short lived: a signature replayed after the window, or after the
   nonce was already spent, is refused (docs/01-architecture.md IdentityPort). */
interface WalletChallengeFields {
  readonly id: AccountId;
  readonly nonce: string;
  readonly address: string;
  readonly expiresAt: Instant;
  readonly usedAt: Instant | null;
}

export class WalletChallenge {
  private constructor(private readonly fields: WalletChallengeFields) {}

  get id(): AccountId {
    return this.fields.id;
  }
  get nonce(): string {
    return this.fields.nonce;
  }
  get address(): string {
    return this.fields.address;
  }
  get expiresAt(): Instant {
    return this.fields.expiresAt;
  }
  get usedAt(): Instant | null {
    return this.fields.usedAt;
  }

  static issue(input: {
    id: AccountId;
    nonce: string;
    address: string;
    expiresAt: Instant;
  }): WalletChallenge {
    return new WalletChallenge({ ...input, address: input.address.toLowerCase(), usedAt: null });
  }

  static restore(fields: WalletChallengeFields): WalletChallenge {
    return new WalletChallenge(fields);
  }

  /* The message the wallet signs. Naming the product and the nonce keeps a
     signature from one context from being replayed in another. */
  message(): string {
    return `Sign in to DeVault\nAddress: ${this.fields.address}\nNonce: ${this.fields.nonce}`;
  }

  spend(now: Instant): Result<WalletChallenge, WalletChallengeExpired | WalletChallengeUsed> {
    if (this.fields.usedAt !== null) {
      return failure(new WalletChallengeUsed());
    }
    if (now.isAfter(this.fields.expiresAt)) {
      return failure(new WalletChallengeExpired());
    }
    return ok(new WalletChallenge({ ...this.fields, usedAt: now }));
  }
}
