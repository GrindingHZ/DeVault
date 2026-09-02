import { DomainError } from '../shared/domain-error';

export class NoteAlreadyListed extends DomainError {
  readonly code = 'NOTE_ALREADY_LISTED';

  constructor() {
    super('The note already has an open sale.');
  }
}
