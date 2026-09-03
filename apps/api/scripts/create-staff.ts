import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';
import { loadConfiguration } from '../src/config/configuration';

/* Creates a vault staff login. Seeding is gone, and accounts now arrive by
   signing a wallet, which makes a member; a staff account has no self-serve
   path, so this makes one by hand for whoever runs the vault console. */
async function main(): Promise<void> {
  const email = process.argv[2];
  const password = process.argv[3];
  if (email === undefined || password === undefined) {
    throw new Error('pass an email and a password');
  }
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const passwordHash = await hash(password);
  const account = await prisma.account.upsert({
    where: { email: email.toLowerCase() },
    update: { roles: ['VAULT_STAFF'] },
    create: { id: ulid(), email: email.toLowerCase(), passwordHash, roles: ['VAULT_STAFF'] },
  });
  await prisma.$disconnect();
  process.stdout.write(`staff account ${account.email} ready with roles ${account.roles.join(', ')}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
