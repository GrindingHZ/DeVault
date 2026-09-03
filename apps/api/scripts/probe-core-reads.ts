import { PrismaClient } from '@prisma/client';
import { readNetworkEndpoints } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createReadOnlyChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';

/* Prints the real gRPC .core response shapes, so the wallet parser reads the
   json fields a full node actually returns rather than the JSON-RPC showContent
   shape that is now off. Point it at any owner that holds objects. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded');
  }
  const client = createReadOnlyChainClient(readNetworkEndpoints());
  const owner = process.argv[2] ?? deployment.publishedBy;
  log(`owner ${owner}`);
  log(`coin ${deployment.settlementCoinType}`);
  log(`package ${deployment.packageId}`);

  const balance = await client.core.getBalance({
    owner,
    coinType: deployment.settlementCoinType,
  });
  log(`BALANCE ${JSON.stringify(balance)}`);

  const owned = await client.core.listOwnedObjects({ owner, include: { json: true } });
  log(`OWNED count ${owned.objects.length}`);
  const first = owned.objects[0];
  if (first !== undefined) {
    log(`OWNED[0].type ${first.type}`);
    log(`OWNED[0].json ${JSON.stringify(first.json)}`);
  }

  const events = await client.core.listEvents({
    filter: { eventType: `${deployment.packageId}::escrow::OfferMade` },
    limit: 3,
    order: 'descending',
  });
  log(`OFFER events ${events.events.length}`);
  const offer = events.events[0];
  if (offer !== undefined) {
    log(`OFFER[0].eventType ${offer.eventType}`);
    log(`OFFER[0].sender ${offer.sender}`);
    log(`OFFER[0].json ${JSON.stringify(offer.json)}`);
  }
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
