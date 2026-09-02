import { DomainError } from '../shared/domain-error';

export class NoteTransferDisabled extends DomainError {
  readonly code = 'NOTE_TRANSFER_DISABLED';

  constructor() {
    super('Note transfer is not enabled.');
  }
}
