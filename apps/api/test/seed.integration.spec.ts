import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* The demo seed is an exit criterion of P8, so it is tested the way it is
   run: as a whole script against an empty database, with the assertions
   made on what it left behind rather than on how it got there. */
describe('the demo seed', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  const apiRoot = path.resolve(__dirname, '..');

  function runInApi(command: string, args: readonly string[], databaseUrl: string): void {
    execFileSync(command, [...args], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('depawn_seed')
      .withUsername('depawn')
      .withPassword('depawn')
      .start();
    const databaseUrl = container.getConnectionUri();
    runInApi('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], databaseUrl);
    runInApi('pnpm', ['run', 'db:seed'], databaseUrl);
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  }, 300_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('fills the vault with inventory an operator can see', async () => {
    // Thirty three items, plus the two receipts the settled sales issued to
    // their buyers for the same items (docs/10-flows.md flow 8).
    expect(await prisma.custodyReceipt.count()).toBe(35);
    const vault = await prisma.vault.findUnique({ where: { id: 'VAULT-DEMO-1' } });
    expect(vault?.city).toBe('New York');
  });

  it('leaves live listings, with and without a book on them', async () => {
    const live = await prisma.listing.findMany({ where: { status: 'ACTIVE' } });
    expect(live.length).toBeGreaterThanOrEqual(6);
    const bookSizes = await Promise.all(
      live.map((listing) => prisma.offer.count({ where: { listingId: listing.id } })),
    );
    /* One a reader can accept from, and one nobody has offered on, because
       those two are different screens. */
    expect(Math.max(...bookSizes)).toBeGreaterThanOrEqual(3);
    expect(Math.min(...bookSizes)).toBe(0);
  });

  it('leaves a listing in every state a borrower can put one in', async () => {
    for (const status of ['DRAFT', 'ACTIVE', 'CANCELLED', 'MATCHED'] as const) {
      expect(
        await prisma.listing.count({ where: { status } }),
        `no listing left ${status}`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('leaves loans at every distance from maturity', async () => {
    const active = await prisma.loan.findMany({ where: { status: 'ACTIVE' } });
    expect(active.length).toBeGreaterThanOrEqual(8);
    const maturities = new Set(active.map((loan) => loan.maturesAt.getTime()));
    expect(maturities.size).toBe(active.length);

    const clock = await prisma.demoClock.findUnique({ where: { id: 'DEMO' } });
    const now = Date.now() + Number(clock?.offsetMs ?? 0n);
    /* The three a reader is meant to be able to tell apart on sight: one
       still running, one past its maturity but inside grace, and one whose
       grace has run out and is waiting for somebody to say so. */
    expect(active.some((loan) => loan.maturesAt.getTime() > now)).toBe(true);
    expect(
      active.some((loan) => loan.maturesAt.getTime() < now && loan.graceEndsAt.getTime() > now),
    ).toBe(true);
    expect(active.some((loan) => loan.graceEndsAt.getTime() < now)).toBe(true);
  });

  it('leaves a loan in every state a loan can end in', async () => {
    expect(await prisma.loan.count({ where: { status: 'REPAID' } })).toBeGreaterThanOrEqual(4);
    expect(await prisma.loan.count({ where: { status: 'DEFAULTED' } })).toBeGreaterThanOrEqual(3);
    expect(await prisma.loan.count({ where: { status: 'LIQUIDATED' } })).toBeGreaterThanOrEqual(2);
  });

  it('leaves the collateral in every state custody can hold it in', async () => {
    /* Two, and both are right: the receipt burns when the item is asked for
       rather than when it is handed over, because the burn is the
       entitlement proof (flow 6). One of these has been collected and the
       other is still on a shelf waiting for its owner. */
    expect(await prisma.custodyReceipt.count({ where: { status: 'RELEASED' } })).toBe(2);
    expect(
      await prisma.custodyReceipt.count({ where: { status: 'ENCUMBERED' } }),
    ).toBeGreaterThanOrEqual(8);
    expect(
      await prisma.custodyReceipt.count({ where: { status: 'IN_VAULT' } }),
    ).toBeGreaterThanOrEqual(8);
    // Asked for and not yet handed over, which is a stage of its own.
    expect(await prisma.redemptionRequest.count()).toBeGreaterThanOrEqual(2);
  });

  it('leaves a sale settled and another still taking bids', async () => {
    expect(await prisma.liquidation.count({ where: { status: 'SETTLED' } })).toBeGreaterThanOrEqual(
      2,
    );
    const bidding = await prisma.liquidation.findMany({ where: { status: 'BIDDING' } });
    expect(bidding).toHaveLength(1);
    const sale = bidding[0];
    if (sale === undefined) {
      throw new Error('the seed must leave one sale taking bids');
    }
    expect(
      await prisma.liquidationBid.count({ where: { liquidationId: sale.id } }),
    ).toBeGreaterThan(0);
  });

  /* Money the reader cannot spend and does not know about, which is the one
     thing the attention bell exists to point at (flow 9). */
  it('leaves a hold that lost and was never reclaimed', async () => {
    expect(await prisma.offer.count({ where: { status: 'SUPERSEDED' } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.fundsHold.count({ where: { status: 'HELD' } })).toBeGreaterThanOrEqual(1);
  });

  /* The account the runbook signs in as used to own nothing at all, so the
     first screen a reader saw was empty. */
  it('gives the account the runbook signs in as both sides of the market', async () => {
    const reader = await prisma.account.findUnique({ where: { email: 'member@demo.test' } });
    if (reader === null) {
      throw new Error('the seed must create the account the runbook names');
    }
    expect(
      await prisma.loan.count({ where: { borrowerAccountId: reader.id } }),
      'nothing borrowed',
    ).toBeGreaterThanOrEqual(5);
    expect(
      await prisma.lenderNote.count({ where: { holderAccountId: reader.id } }),
      'nothing lent',
    ).toBeGreaterThanOrEqual(5);
    expect(
      await prisma.custodyReceipt.count({ where: { holderAccountId: reader.id } }),
      'nothing in the vault',
    ).toBeGreaterThanOrEqual(5);
  });

  /* A wallet with one deposit in it draws a flat line. The chart is only
     worth having if the balance actually moved, more than once, over months. */
  it('leaves a wallet history long enough to have a shape', async () => {
    const reader = await prisma.account.findUnique({ where: { email: 'member@demo.test' } });
    if (reader === null) {
      throw new Error('the seed must create the account the runbook names');
    }
    const accounts = await prisma.ledgerAccount.findMany({ where: { ownerId: reader.id } });
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: { in: accounts.map((one) => one.id) } },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(30);

    const kinds = await prisma.ledgerTransaction.findMany({
      where: { entries: { some: { accountId: { in: accounts.map((one) => one.id) } } } },
      select: { kind: true },
    });
    const seen = new Set(kinds.map((one) => one.kind));
    for (const kind of [
      'DEPOSIT',
      'WITHDRAW',
      'HOLD_FUNDS',
      'ORIGINATE_LOAN',
      'REPAY_LOAN',
    ] as const) {
      expect(seen.has(kind), `no ${kind} in the reader's history`).toBe(true);
    }
  });

  it('leaves a note sale in every state the market can produce', async () => {
    expect(await prisma.noteSale.count({ where: { status: 'OPEN' } })).toBeGreaterThanOrEqual(2);
    expect(await prisma.noteSale.count({ where: { status: 'SOLD' } })).toBe(1);
    expect(await prisma.noteSale.count({ where: { status: 'WITHDRAWN' } })).toBe(1);
    expect(await prisma.noteSale.count({ where: { status: 'VOIDED' } })).toBe(1);

    // The sold note really changed hands: its holder is no longer the
    // account that funded the loan, so repayment will pay the buyer.
    const sold = await prisma.noteSale.findFirst({ where: { status: 'SOLD' } });
    if (sold === null) {
      throw new Error('the seed must leave a sold sale');
    }
    const note = await prisma.lenderNote.findUnique({ where: { id: sold.lenderNoteId } });
    expect(note?.holderAccountId).not.toBe(sold.sellerAccountId);
  });

  /* The seed spreads the book across months by starting its clock that far
     in the past and playing forward, so the demo finishes on roughly the
     real today rather than a season beyond it. Read against that clock every
     date the seed wrote is in the past. Read against a clock that had run
     forwards from now instead, every one of them would sit months in the
     future, which is what a reader kept noticing. */
  it('hands the serving process a clock its own dataset makes sense against', async () => {
    const row = await prisma.demoClock.findUnique({ where: { id: 'DEMO' } });
    const seededNow = Date.now() + Number(row?.offsetMs ?? 0n);
    // Today, give or take the minutes the seed itself took to run.
    expect(Math.abs(seededNow - Date.now())).toBeLessThan(24 * 60 * 60 * 1000);

    for (const loan of await prisma.loan.findMany()) {
      expect(loan.startedAt.getTime()).toBeLessThanOrEqual(seededNow);
    }
    /* Some are still inside their term and some are deliberately past it,
       waiting in grace or waiting for a note holder to call the default.
       What none of them may be is unstarted: read against real time rather
       than against the clock the seed wrote, every one of these would look
       like it begins months from now, which is the bug this asserts is
       absent. */
    const running = await prisma.loan.findMany({ where: { status: 'ACTIVE' } });
    expect(running.some((loan) => loan.maturesAt.getTime() > seededNow)).toBe(true);
    expect(running.some((loan) => loan.maturesAt.getTime() < seededNow)).toBe(true);
    /* Most are still taking offers, and one is deliberately past its date,
       because a borrower looking at a listing that ran out of time is a
       screen the product has to render too. Nothing expires a listing on a
       timer, so it sits ACTIVE with its date behind it. */
    const listings = await prisma.listing.findMany({ where: { status: 'ACTIVE' } });
    expect(listings.some((one) => one.expiresAt.getTime() > seededNow)).toBe(true);
    expect(listings.some((one) => one.expiresAt.getTime() < seededNow)).toBe(true);
  });

  it('balances the ledger it wrote', async () => {
    const rows = await prisma.$queryRaw<{ net: bigint | number | null }[]>`
      SELECT SUM(CASE WHEN direction = 'DEBIT' THEN minor_units ELSE -minor_units END) AS net
      FROM ledger_entry
    `;
    expect(BigInt(rows[0]?.net ?? 0)).toBe(0n);
  });

  it('can be run again without stacking a second story on the first', async () => {
    runInApi('pnpm', ['run', 'db:seed'], container.getConnectionUri());
    expect(await prisma.custodyReceipt.count()).toBe(35);
    expect(await prisma.noteSale.count({ where: { status: 'OPEN' } })).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

/* The exit criterion for P8 is that `pnpm db:seed && pnpm dev` reaches a
   demo ready state. The seed and the serving process are two processes, and
   the clock the seed moved lives in the first one, so the only way to know
   the criterion holds is to start the second one and ask it. This starts the
   real dev entry point against the seeded database and reads it over HTTP. */
describe('a demo process serving the seeded dataset', () => {
  let container: StartedPostgreSqlContainer;
  let api: ChildProcess;
  let origin: string;
  let cookie = '';
  const apiRoot = path.resolve(__dirname, '..');
  // Away from the 3000 the development api uses, so a running one is safe.
  const port = 3771;

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie === '' ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      cookie = setCookie.split(';')[0] ?? cookie;
    }
    return response;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('depawn_demo')
      .withUsername('depawn')
      .withPassword('depawn')
      .start();
    const databaseUrl = container.getConnectionUri();
    const environment = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' };
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: environment,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    execFileSync('pnpm', ['run', 'db:seed'], {
      cwd: apiRoot,
      env: environment,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    /* src/dev.ts is what `pnpm dev` runs, so this is the criterion as
       written rather than an approximation of it. */
    api = spawn(process.execPath, ['-r', '@swc-node/register', 'src/dev.ts'], {
      cwd: apiRoot,
      env: { ...environment, PORT: String(port) },
      stdio: 'ignore',
    });
    origin = `http://127.0.0.1:${port}`;

    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const health = await fetch(`${origin}/api/v1/health`);
        if (health.ok) {
          break;
        }
      } catch {
        // Not listening yet.
      }
      if (Date.now() > deadline) {
        throw new Error('the demo process never started listening');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, 300_000);

  afterAll(async () => {
    api.kill();
    await container.stop();
  });

  it('reports that it is a demo process, so the clock control appears', async () => {
    const health = (await (await call('GET', '/health')).json()) as {
      status: string;
      demoMode: boolean;
      now: string;
    };
    expect(health.status).toBe('ok');
    expect(health.demoMode).toBe(true);
  });

  /* The whole point of writing the offset down. A process that read the
     system clock instead would see every seeded loan starting weeks in the
     future and the book would be nonsense. */
  /* The process takes its clock from the row the seed wrote rather than from
     the wall. That used to be provable by the clock reading months ahead;
     now that the seed lands on today the two agree, so what is worth
     asserting is the pair of properties that actually matter: the demo opens
     on today, and the clock is still the process's own to move. */
  it('opens on today, with a clock it can still move', async () => {
    const health = (await (await call('GET', '/health')).json()) as { now: string };
    const opened = Date.parse(health.now);
    expect(Math.abs(opened - Date.now())).toBeLessThan(24 * 60 * 60 * 1000);

    const advanced = await call('POST', '/test/clock/advance', { milliseconds: 1 });
    expect(advanced.status).toBe(201);
    const moved = Date.parse(((await advanced.json()) as { now: string }).now);
    expect(moved).toBeGreaterThanOrEqual(opened);
  });

  it('serves a loan book that makes sense against its own clock', async () => {
    const signIn = await call('POST', '/auth/login', {
      email: 'ops@demo.test',
      password: 'demo-password-123',
    });
    expect(signIn.status).toBe(200);

    const book = (await (await call('GET', '/admin/loan-book')).json()) as {
      outstandingCount: number;
      overdueCount: number;
      defaultedCount: number;
    };
    /* A book with loans running, some of them overdue, and defaults on it:
       the clock the process inherited is the one the seed wrote those dates
       against. Read against real time every one of them would be counted as
       not yet started, and all three of these would be zero. */
    expect(book.outstandingCount).toBeGreaterThanOrEqual(8);
    expect(book.overdueCount).toBeGreaterThanOrEqual(1);
    expect(book.defaultedCount).toBeGreaterThanOrEqual(3);
  });

  it('shows the story the runbook walks: live listings and a sale taking bids', async () => {
    const listings = (await (await call('GET', '/listings')).json()) as { items: unknown[] };
    expect(listings.items.length).toBeGreaterThanOrEqual(3);

    const sales = (await (await call('GET', '/liquidations')).json()) as {
      items: { status: string; highestBid: unknown }[];
    };
    const bidding = sales.items.filter((sale) => sale.status === 'BIDDING');
    expect(bidding).toHaveLength(1);
    expect(bidding[0]?.highestBid).not.toBeNull();
  });
});
