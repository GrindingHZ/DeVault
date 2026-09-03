import { PrismaClient } from '@prisma/client';
import { readNetworkEndpoints } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createReadOnlyChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';

/* The ListingOpened events and the json of the pledges they point at, so the
   browse read knows how a listing and its wrapped receipt actually render. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded');
  }
  const client = createReadOnlyChainClient(readNetworkEndpoints());
  const events = await client.core.listEvents({
    filter: { eventType: `${deployment.packageId}::pledge::ListingOpened` },
    limit: 5,
    order: 'descending',
  });
  process.stdout.write(`ListingOpened events: ${events.events.length}\n`);
  const first = events.events[0];
  if (first === undefined) {
    return;
  }
  process.stdout.write(`event.json ${JSON.stringify(first.json)}\n`);
  const pledgeId = (first.json as { pledge_id?: string } | null)?.pledge_id;
  if (typeof pledgeId !== 'string') {
    return;
  }
  const objects = await client.core.getObjects({ objectIds: [pledgeId], include: { json: true } });
  const object = objects.objects[0];
  process.stdout.write(`pledge.json ${JSON.stringify(object)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
