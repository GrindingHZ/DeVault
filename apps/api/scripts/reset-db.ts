import { PrismaClient } from '@prisma/client';
import { loadConfiguration } from '../src/config/configuration';
import { readDeployment, recordDeployment } from '../src/infrastructure/chain/chain-deployment.registry';

/* Empties every table, then puts the chain deployment back. The loan book lives
   on chain, so accounts, listings and the rest are demo residue and go; the
   deployment row is infrastructure, the package and coin the app talks to, and
   losing it would break every chain read. */
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  try {
    const deployment = await readDeployment(prisma);
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (rows.length > 0) {
      const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
    }
    if (deployment !== null) {
      await recordDeployment(prisma, deployment);
    }
    process.stdout.write(`database cleared; deployment ${deployment === null ? 'was absent' : 'kept'}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
