import { DomainError } from '../shared/domain-error';

export class WalletSignatureInvalid extends DomainError {
  readonly code = 'WALLET_SIGNATURE_INVALID';

  constructor() {
    super('The signature does not match the address.');
  }
}
