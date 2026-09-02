import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { loadChainConfiguration } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createChainClient } from '../src/infrastructure/chain/chain-client';
import { OperatorSigner } from '../src/infrastructure/chain/operator-signer';
import { publishPackage } from '../src/infrastructure/chain/publish/publish-package';

/* `pnpm chain:publish`: compile, publish with the operator key, and record
   the deployment the api boots from. Idempotent in effect only in that a
   second run publishes a second package and moves the api onto it. */
async function main(): Promise<void> {
  const configuration = loadChainConfiguration();
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  try {
    const deployment = await publishPackage({
      client: createChainClient(configuration),
      signer: new OperatorSigner(configuration),
      prisma,
      configuration,
      repositoryRoot: path.resolve(__dirname, '../../..'),
    });
    process.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
