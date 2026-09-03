import { PrismaClient } from '@prisma/client';
import { loadChainConfiguration } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';
import type { ChainDeploymentRegistry } from '../src/infrastructure/chain/chain-deployment.registry';
import { OperatorSigner } from '../src/infrastructure/chain/operator-signer';
import { CustodianReceiptService } from '../src/modules/chain/custodian-receipt.service';

/* The custodian step by hand: the operator issues a VaultReceipt to a wallet,
   the same call POST /chain/receipts/issue makes. It proves the issue on a live
   node and lands a real receipt in the holder's wallet, which is the fastest way
   to see an item on chain. Needs the operator key in the environment. */
async function main(): Promise<void> {
  const holder = process.argv[2];
  if (holder === undefined) {
    throw new Error('pass the holder wallet address, then an optional appraised value in base units');
  }
  const appraisedValueBaseUnits = process.argv[3] ?? '800000000';
  const configuration = loadChainConfiguration();
  const client = createChainClient(configuration);
  const operator = new OperatorSigner(configuration);
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded');
  }
  const registry = { current: () => deployment } as unknown as ChainDeploymentRegistry;
  const service = new CustodianReceiptService(client, operator, registry);
  const stamp = Date.now().toString();
  const result = await service.issue({
    holder,
    receiptKey: `LC-${stamp}`,
    vault: 'VAULT-1',
    intakeHash: 'sha256:manual',
    appraisedValueBaseUnits,
    itemCategory: 'BULLION',
    insuranceReference: 'POL-MANUAL',
  });
  process.stdout.write(`issued receipt ${result.receiptObjectId}\nto ${holder}\ntx ${result.digest}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
