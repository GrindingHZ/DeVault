import { DomainError } from '../shared/domain-error';

export class WalletChallengeExpired extends DomainError {
  readonly code = 'WALLET_CHALLENGE_EXPIRED';

  constructor() {
    super('This sign in request has expired. Start again.');
  }
}
