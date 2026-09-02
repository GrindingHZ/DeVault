import { DomainError } from '../shared/domain-error';

export class NoteSaleNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('The sale does not exist.');
  }
}
