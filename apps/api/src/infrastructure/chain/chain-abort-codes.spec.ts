import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InsufficientFunds } from '../../domain/ledger/insufficient-funds';
import { LoanNotActive } from '../../domain/lending/loan-not-active';
import { CannotOfferOnOwnListing } from '../../domain/marketplace/cannot-offer-on-own-listing';
import { HoldNotReclaimable } from '../../domain/marketplace/hold-not-reclaimable';
import { ListingNotActive } from '../../domain/marketplace/listing-not-active';
import { NotResourceOwner } from '../../domain/marketplace/not-resource-owner';
import { OfferExpired } from '../../domain/marketplace/offer-expired';
import { OfferNotPending } from '../../domain/marketplace/offer-not-pending';
import { RateAboveMaximum } from '../../domain/marketplace/rate-above-maximum';
import { SystemPaused } from '../../domain/shared/system-paused';
import { domainErrorForAbort, moveAbortCodes } from './chain-abort-codes';

const sources = path.resolve(__dirname, '../../../../../packages/move/sources');

function constantsOf(module: string): Record<string, bigint> {
  const source = readFileSync(path.join(sources, `${module}.move`), 'utf8');
  const constants: Record<string, bigint> = {};
  for (const match of source.matchAll(/^const (E[A-Za-z]+): u64 = (\d+);/gm)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      constants[name] = BigInt(value);
    }
  }
  return constants;
}

/* The map is what turns a chain abort into the domain error the ledger
   would have thrown, so it has to say what the Move sources say. */
describe('moveAbortCodes', () => {
  for (const [module, codes] of Object.entries(moveAbortCodes)) {
    it(`matches the constants in ${module}.move`, () => {
      expect(constantsOf(module)).toEqual(codes);
    });
  }
});

function abort(
  module: string,
  abortCode: bigint,
  functionName = 'f',
): ReturnType<typeof domainErrorForAbort> {
  return domainErrorForAbort({ module, functionName, abortCode });
}

/* A screen that acted on a stale view hears the same code the pre check
   would have given it, whichever of the two refused. */
describe('domainErrorForAbort', () => {
  it('names the listing that stopped taking offers', () => {
    expect(abort('pledge', moveAbortCodes.pledge.ENotOpen)).toBeInstanceOf(ListingNotActive);
  });

  it('names the loan that is no longer active', () => {
    expect(abort('pledge', moveAbortCodes.pledge.ENotActive)).toBeInstanceOf(LoanNotActive);
    expect(abort('pledge', moveAbortCodes.pledge.EPastGrace)).toBeInstanceOf(LoanNotActive);
    expect(abort('pledge', moveAbortCodes.pledge.ENotRepaid)).toBeInstanceOf(LoanNotActive);
  });

  it('names the offer that is gone, expired, or the borrowers own', () => {
    expect(abort('pledge', moveAbortCodes.pledge.EWrongPledge)).toBeInstanceOf(OfferNotPending);
    expect(abort('pledge', moveAbortCodes.pledge.EOfferExpired)).toBeInstanceOf(OfferExpired);
    expect(abort('pledge', moveAbortCodes.pledge.ESelfOffer)).toBeInstanceOf(
      CannotOfferOnOwnListing,
    );
  });

  it('names the rate, the owner, and the short payment', () => {
    expect(abort('pledge', moveAbortCodes.pledge.ERateTooHigh)).toBeInstanceOf(RateAboveMaximum);
    expect(abort('pledge', moveAbortCodes.pledge.ENotBorrower)).toBeInstanceOf(NotResourceOwner);
    expect(abort('pledge', moveAbortCodes.pledge.EInsufficientPayment)).toBeInstanceOf(
      InsufficientFunds,
    );
  });

  it('names a hold that cannot be reclaimed yet', () => {
    expect(abort('escrow', moveAbortCodes.escrow.EStillOpen)).toBeInstanceOf(HoldNotReclaimable);
    expect(abort('escrow', moveAbortCodes.escrow.ENotExpired)).toBeInstanceOf(HoldNotReclaimable);
    expect(abort('escrow', moveAbortCodes.escrow.EWon)).toBeInstanceOf(HoldNotReclaimable);
  });

  it('names the pause', () => {
    expect(abort('config', moveAbortCodes.config.EPaused)).toBeInstanceOf(SystemPaused);
  });

  it('leaves an abort on a value the api computed as a fault', () => {
    expect(abort('escrow', moveAbortCodes.escrow.EEmptyKey)).toBeNull();
    expect(abort('pledge', moveAbortCodes.pledge.EBadCategory)).toBeNull();
    expect(abort('custody', moveAbortCodes.custody.EZeroValue)).toBeNull();
    expect(abort('unknown', 0n)).toBeNull();
  });
});
