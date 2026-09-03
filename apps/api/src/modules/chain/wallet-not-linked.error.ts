import { DomainError } from '../../domain/shared/domain-error';

/* Self-custody has no server-derived address to fall back on: a member acts
   from the wallet they signed in with, so acting on chain without one linked
   is refused rather than guessed. */
export class WalletNotLinked extends DomainError {
  readonly code = 'WALLET_NOT_LINKED';

  constructor() {
    super('Link a Sui wallet before acting on chain.');
  }
}
