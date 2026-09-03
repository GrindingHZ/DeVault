import { DomainError } from '../shared/domain-error';

export class WalletChallengeUsed extends DomainError {
  readonly code = 'WALLET_CHALLENGE_USED';

  constructor() {
    super('This sign in request was already used. Start again.');
  }
}
