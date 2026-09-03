import { InsufficientFunds } from '../../domain/ledger/insufficient-funds';
import { LoanNotActive } from '../../domain/lending/loan-not-active';
import { CannotOfferOnOwnListing } from '../../domain/marketplace/cannot-offer-on-own-listing';
import { HoldNotReclaimable } from '../../domain/marketplace/hold-not-reclaimable';
import { ListingNotActive } from '../../domain/marketplace/listing-not-active';
import { NotResourceOwner } from '../../domain/marketplace/not-resource-owner';
import { OfferExpired } from '../../domain/marketplace/offer-expired';
import { OfferNotPending } from '../../domain/marketplace/offer-not-pending';
import { RateAboveMaximum } from '../../domain/marketplace/rate-above-maximum';
import type { DomainError } from '../../domain/shared/domain-error';
import { SystemPaused } from '../../domain/shared/system-paused';
import type { MoveAbortDetail } from './chain-execution';

/* The abort constants of each Move module, one for one with the sources in
   packages/move. A unit test reads the sources and refuses a drift. */
export const moveAbortCodes = {
  config: { EBadParameters: 0n, EPaused: 1n },
  custody: { EEmptyKey: 0n, EZeroValue: 1n },
  escrow: {
    EEmptyKey: 0n,
    EZeroAmount: 1n,
    EOfferTooShort: 2n,
    ENotExpired: 3n,
    EStillOpen: 4n,
    EWon: 5n,
    EZeroRate: 6n,
  },
  pledge: {
    ENotBorrower: 0n,
    ENotOpen: 1n,
    EWrongPledge: 2n,
    ERateTooHigh: 3n,
    EPastGrace: 4n,
    EBeforeGrace: 5n,
    ENotRepaid: 6n,
    EInsufficientPayment: 7n,
    EWrongNote: 8n,
    EZeroPrincipal: 9n,
    EPrincipalTooHigh: 10n,
    EBadCategory: 11n,
    ESelfOffer: 12n,
    EWrongAmount: 13n,
    EOfferExpired: 14n,
    ENotActive: 15n,
  },
  attestation: { EEmptyEventType: 0n },
} as const;

/* The aborts a domain error already names. The api pre checks every input it
   can before building a transaction, but the state can move between that
   check and the signed execution: another tab takes the listing down, an
   offer expires, the borrower accepts a different hold. The chain is the
   authority on those, and its refusal is answered with the same code the pre
   check would have used, so a screen behind the chain hears why rather than
   a fault. Aborts on values the api itself computes (an empty key, a zero
   coin, a bad category) have no domain meaning and stay faults. */
const { config, escrow, pledge } = moveAbortCodes;

const domainErrorByAbort: Readonly<Record<string, ReadonlyMap<bigint, () => DomainError>>> = {
  config: new Map<bigint, () => DomainError>([[config.EPaused, () => new SystemPaused()]]),
  escrow: new Map<bigint, () => DomainError>([
    [escrow.ENotExpired, () => new HoldNotReclaimable()],
    [escrow.EStillOpen, () => new HoldNotReclaimable()],
    [escrow.EWon, () => new HoldNotReclaimable()],
  ]),
  pledge: new Map<bigint, () => DomainError>([
    [pledge.ENotBorrower, () => new NotResourceOwner()],
    [pledge.ENotOpen, () => new ListingNotActive()],
    [pledge.EWrongPledge, () => new OfferNotPending()],
    [pledge.ERateTooHigh, () => new RateAboveMaximum()],
    /* Past the grace cliff the loan is closed to the borrower: only the
       lender's claim remains. */
    [pledge.EPastGrace, () => new LoanNotActive()],
    [pledge.ENotRepaid, () => new LoanNotActive()],
    [pledge.EInsufficientPayment, () => new InsufficientFunds()],
    [pledge.ESelfOffer, () => new CannotOfferOnOwnListing()],
    [pledge.EOfferExpired, () => new OfferExpired()],
    [pledge.ENotActive, () => new LoanNotActive()],
  ]),
};

export function domainErrorForAbort(abort: MoveAbortDetail): DomainError | null {
  if (abort.module === null || abort.abortCode === null) {
    return null;
  }
  const make = domainErrorByAbort[abort.module]?.get(abort.abortCode);
  return make === undefined ? null : make();
}
