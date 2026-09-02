import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MarketExpirySweep } from '../src/modules/marketplace/application/market-expiry.sweep';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-EXPIRY-1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;
const amount = (minorUnits: string): { minorUnits: string; currency: 'USD' } => ({
  minorUnits,
  currency: 'USD',
});

/* The sweep that writes down what the clock already decided.

   Nothing here changes who may do what: every guard already read the clock,
   so a listing past its date was already refusing offers and acceptance. What
   was missing was the status saying so, which left EXPIRED a state the
   database could hold and the product never wrote, and every screen reading
   the status alone believing a listing was still taking offers
   (docs/14-state-machines.md finding 3). */
describe('market expiry', () => {
  let harness: TestApplication;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Expiry vault',
        city: 'New York',
        insuredLimitMinorUnits: 1_000_000_000n,
        currency: 'USD',
      },
    });
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  async function loginAs(email: string, role: 'MEMBER' | 'OPERATIONS'): Promise<Party> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUnique({ where: { email } });
    if (account === null) {
      throw new Error('registration must create the account');
    }
    return { cookies: login.get('Set-Cookie') ?? [], accountId: account.id, email };
  }

  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  function sweep(): Promise<{ offersExpired: number; listingsExpired: number }> {
    return harness.app.get(MarketExpirySweep).sweepOnce();
  }

  interface Market {
    readonly listingId: string;
    readonly offerId: string;
    readonly lender: Party;
  }

  /* A published listing with one funded offer standing on it, each given its
     own lifetime so a test can run out either one first. */
  async function marketWithDates(
    listingLifetimeMs: number,
    offerLifetimeMs: number,
  ): Promise<Market> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@expiry.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@expiry.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@expiry.test`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: lender.email, amount: amount('400000') })
      .expect(201);

    const receiptId = `R-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
        intakeRecordHash: `hash-${suffix}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'USD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });

    await signInAgain(borrower);
    const listing = await server()
      .post('/api/v1/listings')
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        receiptId,
        requestedPrincipal: amount('250000'),
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30 * oneDay,
        requestedLifetimeMs: listingLifetimeMs,
      })
      .expect(201);
    const listingId = listing.body.id as string;
    await server()
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    await signInAgain(lender);
    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 30 * oneDay,
        expiresAt: new Date(
          Number(harness.clock.now().epochMilliseconds) + offerLifetimeMs,
        ).toISOString(),
      })
      .expect(201);

    return { listingId, offerId: offer.body.id as string, lender };
  }

  async function heldBy(party: Party): Promise<string> {
    await signInAgain(party);
    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', party.cookies)
      .expect(200);
    return (balance.body as { held: { minorUnits: string } }).held.minorUnits;
  }

  it('leaves a listing and an offer alone while both are still live', async () => {
    const market = await marketWithDates(10 * oneDay, 9 * oneDay);
    harness.clock.advanceBy(BigInt(oneDay));

    expect(await sweep()).toEqual({ offersExpired: 0, listingsExpired: 0 });

    const listing = await harness.prisma.listing.findUnique({ where: { id: market.listingId } });
    expect(listing?.status).toBe('ACTIVE');
    const offer = await harness.prisma.offer.findUnique({ where: { id: market.offerId } });
    expect(offer?.status).toBe('PENDING');
  });

  /* An offer can run out before the listing it sits on does, and swept in
     that order it records its own fate rather than inheriting the
     listing's. */
  it('expires an offer that ran out under a listing that has not', async () => {
    const market = await marketWithDates(30 * oneDay, 2 * oneDay);
    harness.clock.advanceBy(BigInt(3 * oneDay));

    expect(await sweep()).toEqual({ offersExpired: 1, listingsExpired: 0 });

    const offer = await harness.prisma.offer.findUnique({ where: { id: market.offerId } });
    expect(offer?.status).toBe('EXPIRED');
    const listing = await harness.prisma.listing.findUnique({ where: { id: market.listingId } });
    expect(listing?.status).toBe('ACTIVE');

    /* And the money stays exactly where it was. An offer that ran out is as
       reclaimable as one that was beaten, and no more refunded (rule M8). */
    expect(await heldBy(market.lender)).toBe('250000');
  });

  it('expires a listing whose date has passed, and the offers standing on it', async () => {
    const market = await marketWithDates(2 * oneDay, 30 * oneDay);
    harness.clock.advanceBy(BigInt(3 * oneDay));

    expect(await sweep()).toEqual({ offersExpired: 0, listingsExpired: 1 });

    const listing = await harness.prisma.listing.findUnique({ where: { id: market.listingId } });
    expect(listing?.status).toBe('EXPIRED');
    /* The offer lost to the listing rather than to its own clock, which is
       what SUPERSEDED means and why the sweep does offers first. */
    const offer = await harness.prisma.offer.findUnique({ where: { id: market.offerId } });
    expect(offer?.status).toBe('SUPERSEDED');
    expect(await heldBy(market.lender)).toBe('250000');
  });

  /* The lender still has to be able to get their money, which is the only
     reason any of this matters to a person. */
  it('leaves a swept hold reclaimable', async () => {
    const market = await marketWithDates(2 * oneDay, 30 * oneDay);
    harness.clock.advanceBy(BigInt(3 * oneDay));
    await sweep();

    await signInAgain(market.lender);
    await server()
      .post(`/api/v1/me/offers/${market.offerId}/reclaim`)
      .set('Cookie', market.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(await heldBy(market.lender)).toBe('0');
  });

  /* Run twice and the second pass has nothing to do. A sweep that re-expired
     what it expired last minute would write an audit entry a minute for
     ever. */
  it('does nothing on a second pass', async () => {
    await marketWithDates(2 * oneDay, oneDay);
    harness.clock.advanceBy(BigInt(3 * oneDay));

    const first = await sweep();
    expect(first.offersExpired + first.listingsExpired).toBeGreaterThan(0);
    expect(await sweep()).toEqual({ offersExpired: 0, listingsExpired: 0 });
  });

  it('announces the offers a swept listing beat, and nothing about the money', async () => {
    await marketWithDates(2 * oneDay, 30 * oneDay);
    harness.clock.advanceBy(BigInt(3 * oneDay));
    await sweep();

    const published = await harness.prisma.outboxEvent.findMany({
      where: { type: 'OfferSuperseded' },
    });
    expect(published).toHaveLength(1);
    // No refund happened, so nothing may claim one did.
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'REFUND_HOLD' } })).toBe(
      0,
    );
  });
});
