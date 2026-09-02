import { DomainError } from '../shared/domain-error';

export class CannotBuyOwnPosition extends DomainError {
  readonly code = 'CANNOT_BUY_OWN_POSITION';

  constructor() {
    super('You already hold a side of this loan.');
  }
}
