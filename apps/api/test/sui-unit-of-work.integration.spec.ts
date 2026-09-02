import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Transaction } from '@mysten/sui/transactions';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type {
  ChainEvent,
  ChainExecution,
  ChainSubmitter,
} from '../src/infrastructure/chain/chain-execution';
import { ChainSettlementRef } from '../src/infrastructure/chain/chain-settlement-ref';
import { SuiUnitOfWork, chainContextOf } from '../src/infrastructure/chain/sui-unit-of-work';
import { FixedClockAdapter } from '../src/infrastructure/clock/fixed-clock.adapter';
import { UlidIdGeneratorAdapter } from '../src/infrastructure/id/ulid-id-generator.adapter';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { Instant } from '../src/domain/shared/instant';

const digest = 'FAKEDIGEST0000000000000000000000000000000000';

class RecordingSubmitter implements ChainSubmitter {
  submissions = 0;
  failWith: Error | null = null;
  events: ChainEvent[] = [];

  execute(transaction: Transaction): Promise<ChainExecution> {
    this.submissions += 1;
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    expect(transaction.getData().commands.length).toBeGreaterThan(0);
    return Promise.resolve({
      digest,
      events: this.events,
      createdObjectIds: [`0x${'1'.repeat(64)}`],
      objectTypes: {},
    });
  }
}

/* A fake submitter proves the unit of work's own promises without a node:
   references resolve at commit, a failure rolls the rows back, and a unit of
   work with nothing to send never submits. */
describe('SuiUnitOfWork', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let submitter: RecordingSubmitter;
  let unitOfWork: SuiUnitOfWork;
  const clock = new FixedClockAdapter(Instant.fromEpochMilliseconds(1_767_225_600_000n));

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('depawn_test')
      .withUsername('depawn')
      .withPassword('depawn')
      .start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    submitter = new RecordingSubmitter();
    unitOfWork = new SuiUnitOfWork(prisma, submitter, clock, new UlidIdGeneratorAdapter());
    await prisma.$executeRawUnsafe('TRUNCATE TABLE outbox_event, audit_log CASCADE');
  });

  function appendSomething(transaction: Transaction): void {
    transaction.moveCall({ target: `0x${'a'.repeat(64)}::escrow::open_wallet`, arguments: [] });
  }

  it('never submits when the work appended nothing', async () => {
    const answer = await unitOfWork.run(() => Promise.resolve(42));
    expect(answer).toBe(42);
    expect(submitter.submissions).toBe(0);
  });

  it('resolves a reference issued inside the work to the digest after the commit', async () => {
    const ref = await unitOfWork.run((context) => {
      const chain = chainContextOf(context);
      appendSomething(chain.chainTransaction);
      const issued = chain.issueSettlementRef();
      expect(issued.isPending).toBe(true);
      expect(issued.reference.startsWith('pending:')).toBe(true);
      return Promise.resolve(issued);
    });
    expect(ref).toBeInstanceOf(ChainSettlementRef);
    expect(ref.isPending).toBe(false);
    expect(ref.reference).toBe(digest);
    expect(submitter.submissions).toBe(1);
  });

  it('patches rows written with the pending token before the commit', async () => {
    await unitOfWork.run(async (context) => {
      const chain = chainContextOf(context);
      appendSomething(chain.chainTransaction);
      const issued = chain.issueSettlementRef();
      await chain.transaction.outboxEvent.create({
        data: {
          id: 'OUTBOX-1',
          type: 'LoanOriginated',
          payload: { loanId: 'L1', settlementRef: { kind: 'chain', reference: issued.reference } },
          occurredAt: new Date(Number(clock.now().epochMilliseconds)),
        },
      });
      await chain.transaction.auditLog.create({
        data: {
          id: 'AUDIT-1',
          actorType: 'ACCOUNT',
          actorId: 'A1',
          subjectType: 'loan',
          subjectId: 'L1',
          action: 'accept_offer',
          after: { settlementRef: issued.reference },
          occurredAt: new Date(Number(clock.now().epochMilliseconds)),
        },
      });
    });
    const outbox = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: 'OUTBOX-1' } });
    expect(JSON.stringify(outbox.payload)).toContain(digest);
    expect(JSON.stringify(outbox.payload)).not.toContain('pending:');
    const audit = await prisma.auditLog.findUniqueOrThrow({ where: { id: 'AUDIT-1' } });
    expect(JSON.stringify(audit.after)).toContain(digest);
  });

  it('rolls the database back and rethrows when the chain refuses', async () => {
    submitter.failWith = new Error('refused');
    await expect(
      unitOfWork.run(async (context) => {
        const chain = chainContextOf(context);
        appendSomething(chain.chainTransaction);
        await chain.transaction.outboxEvent.create({
          data: { id: 'OUTBOX-2', type: 'X', payload: {}, occurredAt: new Date() },
        });
      }),
    ).rejects.toThrow('refused');
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('does not submit the commands of a use case that answered with a rejection', async () => {
    const result = await unitOfWork.run((context) => {
      appendSomething(chainContextOf(context).chainTransaction);
      return Promise.resolve({ ok: false as const, error: { code: 'LISTING_NOT_ACTIVE' } });
    });
    expect(result.ok).toBe(false);
    expect(submitter.submissions).toBe(0);
  });

  it('runs the registered resolvers with the execution', async () => {
    submitter.events = [
      {
        type: 'x::escrow::WalletOpened',
        module: 'escrow',
        name: 'WalletOpened',
        json: { owner: '0x1' },
      },
    ];
    const seen: string[] = [];
    await unitOfWork.run((context) => {
      const chain = chainContextOf(context);
      appendSomething(chain.chainTransaction);
      chain.onResolved((execution) => {
        seen.push(...execution.events.map((event) => event.name), execution.digest);
        return Promise.resolve();
      });
      return Promise.resolve();
    });
    expect(seen).toEqual(['WalletOpened', digest]);
  });
});
