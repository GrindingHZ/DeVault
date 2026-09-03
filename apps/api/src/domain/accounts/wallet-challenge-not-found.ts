import { DomainError } from '../shared/domain-error';

export class WalletChallengeNotFound extends DomainError {
  readonly code = 'WALLET_CHALLENGE_NOT_FOUND';

  constructor() {
    super('No sign in request is open for this address.');
  }
}
