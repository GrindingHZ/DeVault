import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { ChainActionService } from './chain-action.service';
import type { ChainObjectResolver, HoldState, PledgeState } from './chain-object-resolver.service';
import type { ChainTransactionService } from './chain-transaction.service';

const borrower = `0x${'b'.repeat(64)}`;
const lender = `0x${'1'.repeat(64)}`;
const pledgeId = `0x${'5'.repeat(64)}`;
const holdId = `0x${'6'.repeat(64)}`;
const coinId = `0x${'9'.repeat(64)}`;
const noteId = `0x${'8'.repeat(64)}`;

const day = 24 * 60 * 60 * 1000;

function pledge(overrides: Partial<PledgeState> = {}): PledgeState {
  return {
    objectId: pledgeId,
    status: 0,
    borrower,
    requestedPrincipalBaseUnits: 400_000n,
    requestedAprBps: 3600,
    acceptedHoldKey: '',
    maturesAtMs: 0n,
    gracePeriodMs: 0n,
    ...overrides,
  };
}

function hold(overrides: Partial<HoldState> = {}): HoldState {
  return {
    objectId: holdId,
    pledgeId,
    owner: lender,
    expiresAtMs: BigInt(Date.now() + 7 * day),
    ...overrides,
  };
}

/* The resolver answers what the chain would; the transaction service records
   what it was asked to build. */
class FakeResolver {
  pledge: PledgeState | null = pledge();
  hold: HoldState | null = hold();

  pledgeState(): Promise<PledgeState | null> {
    return Promise.resolve(this.pledge);
  }

  holdState(): Promise<HoldState | null> {
    return Promise.resolve(this.hold);
  }

  coinForAmount(): Promise<string> {
    return Promise.resolve(coinId);
  }

  borrowerNoteForPledge(): Promise<string> {
    return Promise.resolve(noteId);
  }

  lenderNoteForPledge(): Promise<string> {
    return Promise.resolve(noteId);
  }
}

class RecordingTransactions {
  built: { method: string; request: unknown } | null = null;

  private record(method: string): (member: string, request: unknown) => Promise<{ transactionBytes: string }> {
    return (_member, request) => {
      this.built = { method, request };
      return Promise.resolve({ transactionBytes: 'BYTES' });
    };
  }

  makeOffer = this.record('makeOffer');
  acceptOffer = this.record('acceptOffer');
  cancelPledge = this.record('cancelPledge');
  repay = this.record('repay');
  collect = this.record('collect');
  claimDefault = this.record('claimDefault');
  reclaimLosing = this.record('reclaimLosing');
  reclaimExpired = this.record('reclaimExpired');
}

async function refusalOf(work: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await work;
  } catch (error: unknown) {
    if (error instanceof DomainErrorHttpException) {
      const body = error.getResponse() as { error: { code: string } };
      return { code: body.error.code, status: error.getStatus() };
    }
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('ChainActionService', () => {
  let resolver: FakeResolver;
  let transactions: RecordingTransactions;
  let service: ChainActionService;

  beforeEach(() => {
    resolver = new FakeResolver();
    transactions = new RecordingTransactions();
    service = new ChainActionService(
      resolver as unknown as ChainObjectResolver,
      transactions as unknown as ChainTransactionService,
    );
  });

  const offer = (aprBps = 3000, amountBaseUnits = '400000') =>
    service.makeOffer(lender, {
      pledgeId,
      amountBaseUnits,
      aprBps,
      expiresAtMs: Date.now() + 7 * day,
    });

  describe('makeOffer', () => {
    it('builds against an open listing with the lender coin', async () => {
      await offer();
      expect(transactions.built?.method).toBe('makeOffer');
      expect(transactions.built?.request).toMatchObject({
        pledgeObjectId: pledgeId,
        coinObjectId: coinId,
        amountBaseUnits: '400000',
        aprBps: 3000,
      });
    });

    it('refuses a listing that was taken down, before any coin is touched', async () => {
      resolver.pledge = pledge({ status: 4 });
      expect(await refusalOf(offer())).toEqual({ code: 'LISTING_NOT_ACTIVE', status: 409 });
      expect(transactions.built).toBeNull();
    });

    it('refuses an id that is not a pledge', async () => {
      resolver.pledge = null;
      expect(await refusalOf(offer())).toEqual({ code: 'LISTING_NOT_ACTIVE', status: 409 });
    });

    it('refuses a listing another offer already funded', async () => {
      resolver.pledge = pledge({ status: 1 });
      expect(await refusalOf(offer())).toEqual({ code: 'LISTING_ALREADY_MATCHED', status: 409 });
    });

    it('refuses the borrower lending to themselves', async () => {
      const refusal = await refusalOf(
        service.makeOffer(borrower, {
          pledgeId,
          amountBaseUnits: '400000',
          aprBps: 3000,
          expiresAtMs: Date.now() + 7 * day,
        }),
      );
      expect(refusal).toEqual({ code: 'CANNOT_OFFER_ON_OWN_LISTING', status: 422 });
    });

    it('refuses a rate above the asked maximum', async () => {
      expect(await refusalOf(offer(3601))).toEqual({ code: 'RATE_ABOVE_MAXIMUM', status: 422 });
    });

    it('refuses an amount other than the asked principal', async () => {
      await expect(offer(3000, '399999')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('acceptOffer', () => {
    const accept = (member = borrower) =>
      service.acceptOffer(member, { pledgeId, holdObjectId: holdId, termMs: 30 * day });

    it('builds when the listing is open, the hold stands, and the borrower asks', async () => {
      await accept();
      expect(transactions.built?.method).toBe('acceptOffer');
    });

    it('refuses anyone but the borrower', async () => {
      expect(await refusalOf(accept(lender))).toEqual({ code: 'FORBIDDEN', status: 403 });
    });

    it('refuses a hold that is gone or against another listing', async () => {
      resolver.hold = null;
      expect(await refusalOf(accept())).toEqual({ code: 'OFFER_NOT_PENDING', status: 409 });
      resolver.hold = hold({ pledgeId: `0x${'7'.repeat(64)}` });
      expect(await refusalOf(accept())).toEqual({ code: 'OFFER_NOT_PENDING', status: 409 });
    });

    it('refuses a hold past its own expiry', async () => {
      resolver.hold = hold({ expiresAtMs: BigInt(Date.now() - 1) });
      expect(await refusalOf(accept())).toEqual({ code: 'OFFER_EXPIRED', status: 409 });
    });

    it('refuses a listing that already became a loan', async () => {
      resolver.pledge = pledge({ status: 1 });
      expect(await refusalOf(accept())).toEqual({ code: 'LISTING_ALREADY_MATCHED', status: 409 });
    });
  });

  describe('cancelPledge', () => {
    it('refuses a listing that already became a loan', async () => {
      resolver.pledge = pledge({ status: 1 });
      expect(await refusalOf(service.cancelPledge(borrower, { pledgeId }))).toEqual({
        code: 'LISTING_ALREADY_MATCHED',
        status: 409,
      });
    });

    it('refuses a listing already taken down', async () => {
      resolver.pledge = pledge({ status: 4 });
      expect(await refusalOf(service.cancelPledge(borrower, { pledgeId }))).toEqual({
        code: 'LISTING_NOT_ACTIVE',
        status: 409,
      });
    });

    it('refuses anyone but the borrower, and builds for them', async () => {
      expect(await refusalOf(service.cancelPledge(lender, { pledgeId }))).toEqual({
        code: 'FORBIDDEN',
        status: 403,
      });
      await service.cancelPledge(borrower, { pledgeId });
      expect(transactions.built?.method).toBe('cancelPledge');
    });
  });

  describe('reclaimHold', () => {
    const reclaim = () => service.reclaimHold(lender, { holdObjectId: holdId, pledgeId });

    it('reclaims against the pledge once it stops taking offers', async () => {
      resolver.pledge = pledge({ status: 4 });
      await reclaim();
      expect(transactions.built?.method).toBe('reclaimLosing');
      resolver.pledge = pledge({ status: 1 });
      await reclaim();
      expect(transactions.built?.method).toBe('reclaimLosing');
    });

    it('reclaims on the clock once the offer lapsed on an open listing', async () => {
      resolver.hold = hold({ expiresAtMs: BigInt(Date.now() - 1) });
      await reclaim();
      expect(transactions.built?.method).toBe('reclaimExpired');
    });

    it('refuses a hold still standing on an open listing', async () => {
      expect(await refusalOf(reclaim())).toEqual({ code: 'HOLD_NOT_RECLAIMABLE', status: 422 });
    });

    it('refuses a hold already refunded', async () => {
      resolver.hold = null;
      expect(await refusalOf(reclaim())).toEqual({ code: 'HOLD_NOT_RECLAIMABLE', status: 422 });
    });
  });

  describe('loans', () => {
    it('repays only an active loan inside its grace', async () => {
      resolver.pledge = pledge({ status: 2 });
      expect(await refusalOf(service.repay(borrower, { pledgeId }))).toEqual({
        code: 'LOAN_NOT_ACTIVE',
        status: 409,
      });
      resolver.pledge = pledge({
        status: 1,
        maturesAtMs: BigInt(Date.now() - 2 * day),
        gracePeriodMs: BigInt(day),
      });
      expect(await refusalOf(service.repay(borrower, { pledgeId }))).toEqual({
        code: 'LOAN_NOT_ACTIVE',
        status: 409,
      });
      resolver.pledge = pledge({
        status: 1,
        maturesAtMs: BigInt(Date.now() + 2 * day),
        gracePeriodMs: BigInt(day),
      });
      await service.repay(borrower, { pledgeId });
      expect(transactions.built?.method).toBe('repay');
    });

    it('collects only a repaid loan', async () => {
      resolver.pledge = pledge({ status: 5 });
      expect(await refusalOf(service.collect(lender, { pledgeId }))).toEqual({
        code: 'LOAN_NOT_ACTIVE',
        status: 409,
      });
      resolver.pledge = pledge({ status: 2 });
      await service.collect(lender, { pledgeId });
      expect(transactions.built?.method).toBe('collect');
    });

    it('claims only past the grace cliff', async () => {
      resolver.pledge = pledge({
        status: 1,
        maturesAtMs: BigInt(Date.now()),
        gracePeriodMs: BigInt(day),
      });
      expect(await refusalOf(service.claim(lender, { pledgeId }))).toEqual({
        code: 'GRACE_PERIOD_ACTIVE',
        status: 422,
      });
      resolver.pledge = pledge({
        status: 1,
        maturesAtMs: BigInt(Date.now() - 2 * day),
        gracePeriodMs: BigInt(day),
      });
      await service.claim(lender, { pledgeId });
      expect(transactions.built?.method).toBe('claimDefault');
    });
  });
});
