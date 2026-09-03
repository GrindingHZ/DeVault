import { DomainError } from '../shared/domain-error';

/* A borrower funding their own listing would lend themselves their own money
   through a fee and a loan nobody else is party to. The contract refuses the
   offer, and this is the refusal's name. */
export class CannotOfferOnOwnListing extends DomainError {
  readonly code = 'CANNOT_OFFER_ON_OWN_LISTING';

  constructor() {
    super('You cannot lend against your own item.');
  }
}
