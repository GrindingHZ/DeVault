import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { CHAIN_RECONCILIATION_PORT } from '../src/domain/ports/chain-reconciliation.port';
import type { ChainReconciliationPort } from '../src/domain/ports/chain-reconciliation.port';
import { ChainEventIndexer } from '../src/infrastructure/chain/indexer/chain-event.indexer';
import { chainTestNetwork, isLocalnetReachable, localnetGrpcUrl } from './chain/chain-test-network';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

/* The three indexer properties docs/06-testing.md calls mandatory, plus the
   reconciliation that reads the same chain back. */
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const password = 'a-long-enough-password';
const amount = (minorUnits: string): { minorUnits: string; currency: 'USD' } => ({
  minorUnits,
  currency: 'USD',
});

const network = chainTestNetwork({ settlement: true, custody: true });
const reachable = await isLocalnetReachable();

describe.skipIf(!reachable)(`the chain indexer (localnet at ${localnetGrpcUrl})`, () => {
  let harness: TestApplication;
  let indexer: ChainEventIndexer;

  beforeAll(async () => {
    harness = await createTestApplication([], {
      environment: network.environment,
      prepare: (databaseUrl) => network.prepare(databaseUrl),
    });
    indexer = harness.app.get(ChainEventIndexer);
    await harness.prisma.vault.create({
      data: {
        id: 'VAULT-INDEX-1',
        name: 'Index vault',
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

  async function loginAs(email: string, role: 'MEMBER' | 'OPERATIONS'): Promise<string[]> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  async function deposit(opsCookies: string[], email: string, minorUnits: string): Promise<void> {
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
  }

  it('ingests each event once, resumes from its cursor, and rebuilds the same rows on replay', async () => {
    const suffix = randomUUID().slice(0, 8);
    const ops = await loginAs(`ops-${suffix}@index.test`, 'OPERATIONS');
    await loginAs(`lender-${suffix}@index.test`, 'MEMBER');
    await deposit(ops, `lender-${suffix}@index.test`, '250000');

    const first = await indexer.drainOnce();
    expect(first).toBeGreaterThanOrEqual(2);
    const afterFirst = await harness.prisma.chainEvent.count();
    expect(await indexer.drainOnce()).toBe(0);
    expect(await harness.prisma.chainEvent.count()).toBe(afterFirst);

    // A second deposit, then a new indexer over the same database picks up
    // only what arrived since the cursor.
    await deposit(ops, `lender-${suffix}@index.test`, '1000');
    const restarted = harness.app.get(ChainEventIndexer);
    expect(await restarted.drainOnce()).toBe(1);
    const escrowEvents = await harness.prisma.chainEvent.findMany({
      where: { module: 'escrow' },
      orderBy: [{ checkpoint: 'asc' }, { eventIndex: 'asc' }],
    });
    expect(escrowEvents.map((event) => event.eventType.split('::').pop())).toEqual([
      'WalletOpened',
      'FundsDeposited',
      'FundsDeposited',
    ]);

    const before = await harness.prisma.chainEvent.findMany({ orderBy: { id: 'asc' } });
    await harness.prisma.chainEvent.deleteMany({});
    const replayed = await indexer.replayFromStart();
    expect(replayed).toBe(before.length);
    const after = await harness.prisma.chainEvent.findMany({ orderBy: { id: 'asc' } });
    expect(after.map((row) => [row.id, row.eventType, row.digest, row.json])).toEqual(
      before.map((row) => [row.id, row.eventType, row.digest, row.json]),
    );
  });

  it('reports drift when the projection disagrees with the chain', async () => {
    const reconciliation = harness.app.get<ChainReconciliationPort>(CHAIN_RECONCILIATION_PORT);
    const clean = await reconciliation.run();
    expect(clean.enabled).toBe(true);
    expect(clean.drift).toEqual([]);

    const wallet = await harness.prisma.chainWallet.findFirstOrThrow({
      where: { accountId: { not: 'PLATFORM_FLOAT' } },
    });
    // Corrupt the mirror: a ledger entry the chain never saw.
    const available = await harness.prisma.ledgerAccount.findFirstOrThrow({
      where: { ownerId: wallet.accountId, purpose: 'USER_AVAILABLE' },
    });
    const float = await harness.prisma.ledgerAccount.findFirstOrThrow({
      where: { purpose: 'PLATFORM_FLOAT' },
    });
    await harness.prisma.ledgerTransaction.create({
      data: {
        id: 'CORRUPT-1',
        kind: 'DEPOSIT',
        reference: 'corrupt',
        occurredAt: new Date(),
        entries: {
          create: [
            {
              id: 'CORRUPT-1-D',
              accountId: float.id,
              direction: 'DEBIT',
              minorUnits: 100n,
              currency: 'USD',
            },
            {
              id: 'CORRUPT-1-C',
              accountId: available.id,
              direction: 'CREDIT',
              minorUnits: 100n,
              currency: 'USD',
            },
          ],
        },
      },
    });
    const report = await reconciliation.run();
    expect(report.drift).toEqual([
      expect.objectContaining({ subjectType: 'wallet', subjectId: wallet.id, field: 'funds' }),
    ]);
  });
});
