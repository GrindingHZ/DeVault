import { PrismaClient } from '@prisma/client';
import { readNetworkEndpoints } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createReadOnlyChainClient } from '../src/infrastructure/chain/chain-client';
import type { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { WalletReadService } from '../src/modules/chain-read/wallet-read.service';

/* Proves the wallet read against live testnet, which no unit test can: it hits
   a real full node over gRPC and derives the figures a member would see. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const client = createReadOnlyChainClient(readNetworkEndpoints());
  const service = new WalletReadService(client, prisma as unknown as PrismaService);
  const owner = process.argv[2];
  if (owner === undefined) {
    throw new Error('pass an owner address');
  }
  const result = await service.read(owner, Date.now());
  await prisma.$disconnect();
  const figures = Object.fromEntries(
    Object.entries(result.figures).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        decimals: result.decimals,
        figures,
        items: result.items.map((item) => ({
          objectId: item.objectId,
          appraisedValueBaseUnits: item.appraisedValueBaseUnits.toString(),
          itemCategory: item.itemCategory,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
