import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { chainAmountOf } from '../src/infrastructure/chain/ptb/codec';
import { Money, currencyOf } from '../src/domain/shared/money';
import { ChainInspector } from './chain/chain-inspector';
import { chainTestNetwork, isLocalnetReachable, localnetGrpcUrl } from './chain/chain-test-network';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

/* Rule S2 on the chain driver: a pause reaches the chain config and closes
   the entrance, and a lender still gets their money back while it is on. */
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const usd = currencyOf('USD');
const vaultId = 'VAULT-PAUSE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'USD' } => ({
  minorUnits,
  currency: 'USD',
});

interface Party {
  cookies: string[];
  readonly email: string;
  readonly accountId: string;
}

const network = chainTestNetwork({ settlement: true, custody: true });
const reachable = await isLocalnetReachable();

describe.skipIf(!reachable)(`pausing on chain (localnet at ${localnetGrpcUrl})`, () => {
  let harness: TestApplication;
  let inspector: ChainInspector;

  beforeAll(async () => {
    harness = await createTestApplication([], {
      environment: network.environment,
      prepare: (databaseUrl) => network.prepare(databaseUrl),
    });
    inspector = new ChainInspector(network.client, network.deployment().packageId);
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Pause vault',
        city: 'New York',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'USD',
      },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function loginAs(email: string, role: 'MEMBER' | 'OPERATIONS'): Promise<Party> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUniqueOrThrow({ where: { email } });
    return { cookies: login.get('Set-Cookie') ?? [], email, accountId: account.id };
  }

  async function post(path: string, party: Party, body: object, status = 201) {
    return server()
      .post(path)
      .set('Cookie', party.cookies)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(status);
  }

  async function pausedOnChain(): Promise<unknown> {
    return (await inspector.object(network.deployment().configId)).json.paused;
  }

  it('closes the entrance on chain and still refunds a withdrawn offer', async () => {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@pause.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@pause.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@pause.test`, 'OPERATIONS');
    await post('/api/v1/me/deposits', ops, { email: lender.email, amount: amount('250000') });
    await harness.prisma.custodyReceipt.create({
      data: {
        id: `R-${suffix}`,
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
    await harness.prisma.listing.create({
      data: {
        id: `L-${suffix}`,
        borrowerAccountId: borrower.accountId,
        receiptId: `R-${suffix}`,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'USD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30n * oneDay,
        expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 86_400_000),
        status: 'ACTIVE',
      },
    });
    const offerBody = {
      principal: amount('125000'),
      annualPercentageRateBasisPoints: 1800,
      durationMs: Number(30n * oneDay),
      expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 3_600_000).toISOString(),
    };
    const offer = await post(`/api/v1/listings/L-${suffix}/offers`, lender, offerBody);
    expect(await pausedOnChain()).toBe(false);

    await post('/api/v1/admin/pause', ops, { reason: 'drill' });
    expect(await pausedOnChain()).toBe(true);
    const refused = await post(`/api/v1/listings/L-${suffix}/offers`, lender, offerBody, 422);
    expect(refused.body.error.code).toBe('SYSTEM_PAUSED');

    // The minimum offer lifetime has to pass before a withdrawal; the clock
    // moves, the session expires with it, and the lender signs in again.
    harness.clock.advanceBy(11n * 60n * 1000n);
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: lender.email, password })
      .expect(200);
    lender.cookies = login.get('Set-Cookie') ?? [];
    const withdrawn = await post(
      `/api/v1/listings/L-${suffix}/offers/${offer.body.id}/withdraw`,
      lender,
      {},
    );
    expect(withdrawn.body.settlementRef.kind).toBe('chain');
    const wallet = await harness.prisma.chainWallet.findUniqueOrThrow({
      where: { id: `${lender.accountId}:USD` },
    });
    const balance = (await inspector.object(wallet.objectId ?? '')).json.funds;
    expect(balance).toBe(chainAmountOf(Money.of(250_000n, usd), network.deployment()).toString());

    await post('/api/v1/admin/unpause', ops, {});
    expect(await pausedOnChain()).toBe(false);
  });
});
