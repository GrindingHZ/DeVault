import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { loadChainConfiguration } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';
import { textOfBytesField } from '../src/infrastructure/chain/ptb/codec';
import { solidPng } from '../src/infrastructure/storage/solid-png';

/* `pnpm chain:walk`: drives an api running on the chain drivers through a
   whole loan over HTTP and, after every step, reads the chain the way an
   explorer would. It exists to see what happens rather than to assert it;
   the assertions live in test/chain-lifecycle.integration.spec.ts. */
const api = process.env.CHAIN_WALK_API ?? 'http://localhost:3100';
const password = 'walk-password-123';
const day = 24 * 60 * 60 * 1000;

interface Party {
  cookie: string;
  readonly email: string;
  readonly accountId: string;
}

const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
const client = createChainClient(loadChainConfiguration());

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function call(
  method: string,
  path: string,
  party: Party | null,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
  };
  if (party !== null) {
    headers.cookie = party.cookie;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${api}/api/v1${path}`, init);
  const text = await response.text();
  const parsed: unknown = text === '' ? {} : JSON.parse(text);
  return {
    status: response.status,
    body: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {},
  };
}

async function loginAs(
  email: string,
  role: 'MEMBER' | 'OPERATIONS' | 'VAULT_STAFF',
): Promise<Party> {
  await call('POST', '/auth/register', null, { email, password });
  if (role !== 'MEMBER') {
    await prisma.account.update({ where: { email }, data: { roles: [role] } });
  }
  const response = await fetch(`${api}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const account = await prisma.account.findUniqueOrThrow({ where: { email } });
  return { cookie, email, accountId: account.id };
}

async function objectJson(objectId: string): Promise<Record<string, unknown>> {
  const { object } = await client.core.getObject({ objectId, include: { json: true } });
  return object.json ?? {};
}

async function walletOf(accountId: string): Promise<string> {
  const row = await prisma.chainWallet.findUnique({ where: { id: `${accountId}:USD` } });
  if (row?.objectId === null || row === null) {
    return 'no wallet yet';
  }
  const json = await objectJson(row.objectId);
  return `wallet ${row.objectId.slice(0, 10)}.. funds ${String(json.funds)} base units`;
}

async function receiptOf(receiptId: string): Promise<string> {
  const row = await prisma.chainReceipt.findUnique({ where: { receiptId } });
  if (row?.objectId === null || row === null) {
    return 'no object';
  }
  try {
    const json = await objectJson(row.objectId);
    return `receipt ${row.objectId.slice(0, 10)}.. status ${String(json.status)} holder ${String(json.holder).slice(0, 10)}.. encumbered_by "${textOfBytesField(json.encumbered_by)}"`;
  } catch {
    return `receipt ${row.objectId.slice(0, 10)}.. no longer exists (burned)`;
  }
}

async function latestEvents(packageId: string, module: string, count: number): Promise<string[]> {
  const response = await client.listEvents({
    filter: { emitModule: `${packageId}::${module}` },
    order: 'descending',
    limit: count,
  });
  return response.events.reverse().map((entry) => {
    const [, name = ''] = entry.eventType.split(/::(?=[^:]+$)/);
    const json = entry.json ?? {};
    const detail =
      module === 'attestation'
        ? `${textOfBytesField(json.event_type)} ${textOfBytesField(json.subject_id)}`
        : Object.entries(json)
            .filter(([key]) =>
              ['amount', 'reason', 'owner', 'recipient', 'holder', 'claimant', 'to'].includes(key),
            )
            .map(([key, value]) => `${key}=${String(value).slice(0, 12)}`)
            .join(' ');
    return `    ${module}::${name} ${detail} (${entry.transactionDigest.slice(0, 8)}..)`;
  });
}

async function main(): Promise<void> {
  const deployment = await readDeployment(prisma);
  if (deployment === null) {
    throw new Error('No deployment recorded; run pnpm chain:publish first');
  }
  say(`package ${deployment.packageId} on ${deployment.network}`);
  const suffix = randomUUID().slice(0, 6);
  const borrower = await loginAs(`walk-borrower-${suffix}@demo.test`, 'MEMBER');
  const lender = await loginAs(`walk-lender-${suffix}@demo.test`, 'MEMBER');
  const ops = await loginAs(`walk-ops-${suffix}@demo.test`, 'OPERATIONS');
  const staff = await loginAs(`walk-staff-${suffix}@demo.test`, 'VAULT_STAFF');
  say(`accounts: borrower ${borrower.email}, lender ${lender.email} (password ${password})`);

  const money = (minorUnits: string) => ({ minorUnits, currency: 'USD' });
  const step = async (
    label: string,
    run: () => Promise<{ status: number; body: Record<string, unknown> }>,
  ) => {
    const response = await run();
    say(`\n== ${label} -> ${response.status}`);
    return response.body;
  };

  const deposit = await step('ops deposits 2500.00 USD to the lender', () =>
    call('POST', '/me/deposits', ops, { email: lender.email, amount: money('250000') }),
  );
  say(`   settlementRef ${JSON.stringify(deposit.settlementRef)}`);
  say(`   lender: ${await walletOf(lender.accountId)}`);
  for (const line of await latestEvents(deployment.packageId, 'escrow', 2)) say(line);

  const vault = await prisma.vault.findFirstOrThrow();
  const intake = await step('staff begins an intake', () =>
    call('POST', `/vaults/${vault.id}/intakes`, staff, {
      borrowerEmail: borrower.email,
      itemCategory: 'WATCH',
      itemDescription: 'Steel sports watch, walk demo',
    }),
  );
  const intakeId = String(intake.id);
  await call('PATCH', `/intakes/${intakeId}`, staff, {
    serialNumbers: [`SN-${suffix}`],
    sealNumber: 'SEAL-7',
  });
  const form = new FormData();
  form.append(
    'photo',
    new Blob([solidPng(32, 32, [40, 90, 160])], { type: 'image/png' }),
    'front.png',
  );
  await fetch(`${api}/api/v1/intakes/${intakeId}/photos`, {
    method: 'POST',
    headers: { cookie: staff.cookie },
    body: form,
  });
  await call('POST', `/intakes/${intakeId}/appraisals`, staff, {
    value: money('500000'),
    method: 'dealer quote',
    comparableReferences: 'chrono24',
  });
  await call('POST', `/intakes/${intakeId}/seal`, staff, {});
  const issued = await step('staff issues the receipt', () =>
    call('POST', `/intakes/${intakeId}/issue-receipt`, staff, {
      insurancePolicyReference: 'POL-WALK',
    }),
  );
  const receiptId = String(issued.id);
  say(`   ${await receiptOf(receiptId)}`);
  for (const line of await latestEvents(deployment.packageId, 'custody', 1)) say(line);

  const listing = await step('borrower lists the receipt for 2500.00', () =>
    call('POST', '/listings', borrower, {
      receiptId,
      requestedPrincipal: money('250000'),
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 30 * day,
      requestedLifetimeMs: day,
    }),
  );
  const listingId = String(listing.id);
  await step('borrower publishes it', () =>
    call('POST', `/listings/${listingId}/publish`, borrower, {}),
  );
  for (const line of await latestEvents(deployment.packageId, 'attestation', 1)) say(line);

  const offer = await step('lender offers 2500.00 at 18%', () =>
    call('POST', `/listings/${listingId}/offers`, lender, {
      principal: money('250000'),
      annualPercentageRateBasisPoints: 1800,
      durationMs: 30 * day,
      expiresAt: new Date(Date.now() + 3 * day).toISOString(),
    }),
  );
  say(`   lender: ${await walletOf(lender.accountId)}`);
  for (const line of await latestEvents(deployment.packageId, 'escrow', 1)) say(line);

  const loan = await step('borrower accepts: one transaction settles it', () =>
    call('POST', `/listings/${listingId}/offers/${String(offer.id)}/accept`, borrower, {}),
  );
  say(`   originationSettlementRef ${JSON.stringify(loan.originationSettlementRef)}`);
  say(`   borrower: ${await walletOf(borrower.accountId)}`);
  say(`   operator (fees): ${await walletOf('PLATFORM_FLOAT')}`);
  say(`   ${await receiptOf(receiptId)}`);
  for (const line of await latestEvents(deployment.packageId, 'escrow', 5)) say(line);
  for (const line of await latestEvents(deployment.packageId, 'custody', 1)) say(line);
  for (const line of await latestEvents(deployment.packageId, 'attestation', 2)) say(line);

  await step('ops deposits 500.00 to the borrower for the interest', () =>
    call('POST', '/me/deposits', ops, { email: borrower.email, amount: money('50000') }),
  );
  const quote = await call('GET', `/loans/${String(loan.id)}/payoff-quote`, borrower);
  const repaid = await step(`borrower repays ${JSON.stringify(quote.body.total)}`, () =>
    call('POST', `/loans/${String(loan.id)}/repay`, borrower, {
      amount: quote.body.total,
      quotedAt: quote.body.quotedAt,
    }),
  );
  say(`   loan status ${String((repaid.loan as Record<string, unknown> | undefined)?.status)}`);
  say(`   lender: ${await walletOf(lender.accountId)}`);
  say(`   ${await receiptOf(receiptId)}`);
  for (const line of await latestEvents(deployment.packageId, 'escrow', 1)) say(line);
  for (const line of await latestEvents(deployment.packageId, 'custody', 1)) say(line);

  await step('borrower asks for the item back: the receipt burns', () =>
    call('POST', `/receipts/${receiptId}/redemption-requests`, borrower, {}),
  );
  say(`   ${await receiptOf(receiptId)}`);
  for (const line of await latestEvents(deployment.packageId, 'custody', 1)) say(line);
  say(`\nsign in to the marketplace as ${borrower.email} / ${password} to see the loan`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
