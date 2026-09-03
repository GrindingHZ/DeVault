import { PrismaClient } from '@prisma/client';
import { loadConfiguration } from '../src/config/configuration';

/* Repoints the recorded deployment at a different settlement coin. The loan
   contracts are generic over the coin, so the package needs no republish: the
   api simply instantiates every transaction with the new type. Used to move
   testnet off the mintable stand in and onto Circle's own USDC. */
async function main(): Promise<void> {
  const coinType = process.argv[2];
  if (coinType === undefined) {
    throw new Error('pass the settlement coin type');
  }
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const updated = await prisma.chainDeployment.update({
    where: { id: 'ACTIVE' },
    data: { settlementCoinType: coinType },
  });
  await prisma.$disconnect();
  process.stdout.write(`settlementCoinType is now ${updated.settlementCoinType}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
