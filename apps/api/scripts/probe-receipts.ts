import { PrismaClient } from '@prisma/client';
import { readNetworkEndpoints } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createReadOnlyChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';

/* Which address a freshly issued receipt landed on, and whether the wallet
   read's type filter finds it. Tells an address mismatch apart from a filter
   that does not match the object's actual type. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded');
  }
  const client = createReadOnlyChainClient(readNetworkEndpoints());
  const packageId = deployment.packageId;
  const receiptType = `${packageId}::custody::VaultReceipt`;

  const events = await client.core.listEvents({
    filter: { eventType: `${packageId}::custody::ReceiptIssued` },
    limit: 5,
    order: 'descending',
  });
  log(`ReceiptIssued events: ${events.events.length}`);
  for (const event of events.events) {
    const json = event.json as { holder?: string; receipt_id?: string } | null;
    log(`  holder ${json?.holder ?? '?'}  receipt ${json?.receipt_id ?? '?'}`);
  }
  const holder = (events.events[0]?.json as { holder?: string } | null)?.holder;
  if (holder === undefined) {
    return;
  }

  const owned = await client.core.listOwnedObjects({ owner: holder, include: { json: true } });
  log(`\nowner ${holder} holds ${owned.objects.length} objects:`);
  for (const object of owned.objects) {
    log(`  ${object.type}`);
  }

  const filtered = await client.core.listOwnedObjects({
    owner: holder,
    type: receiptType,
    include: { json: true },
  });
  log(`\nfilter "${receiptType}" -> ${filtered.objects.length} objects`);
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
