import { DomainError } from '../shared/domain-error';

export class NoteSaleNotOpen extends DomainError {
  readonly code = 'NOTE_SALE_NOT_OPEN';

  constructor() {
    super('The sale is not open.');
  }
}
