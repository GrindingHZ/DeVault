import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { PrismaClient } from '@prisma/client';
import { loadChainConfiguration } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import { createChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';
import { OperatorSigner } from '../src/infrastructure/chain/operator-signer';
import { fromBase64 } from '@mysten/sui/utils';
import { GrpcSponsoredTransactionGateway } from '../src/infrastructure/chain/grpc-sponsored-transaction';
import { appendIssueReceipt } from '../src/infrastructure/chain/ptb/custody-calls';
import { appendOpenPledge } from '../src/infrastructure/chain/ptb/pledge-calls';

/* A single sponsored round trip against live testnet, to prove the flow the
   whole self-custody api is built on: the operator issues a receipt to a
   member (operator signed), then the member opens a pledge in a transaction
   the member signs and the sponsor pays for. */
async function main(): Promise<void> {
  const configuration = loadChainConfiguration();
  const client = createChainClient(configuration);
  const operator = new OperatorSigner(configuration);
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded; run pnpm chain:publish first');
  }

  const member = Ed25519Keypair.deriveKeypairFromSeed('1'.repeat(64));
  const memberAddress = member.toSuiAddress();
  process.stdout.write(`operator ${operator.address}\nmember   ${memberAddress}\n`);

  // Step 1: operator issues a receipt to the member (operator signed).
  const issue = new Transaction();
  appendIssueReceipt(issue, deployment, {
    receiptKey: `SMOKE-${Date.now().toString()}`,
    vault: 'VAULT-1',
    holder: memberAddress,
    intakeHash: 'sha256:smoke',
    appraisedValueBaseUnits: 500_000_000n,
    appraisedAtMs: BigInt(Date.now()),
    itemCategory: 'BULLION',
    insuranceReference: 'POL-SMOKE',
  });
  const issued = await client.core.signAndExecuteTransaction({
    transaction: issue,
    signer: operator.keypair,
    include: { effects: true, objectTypes: true },
  });
  if (issued.$kind === 'FailedTransaction') {
    throw new Error(`issue failed: ${JSON.stringify(issued.FailedTransaction.status)}`);
  }
  await client.waitForTransaction({ digest: issued.Transaction.digest });
  const objectTypes: Record<string, string> = issued.Transaction.objectTypes ?? {};
  const receiptEntry = Object.entries(objectTypes).find(([, type]) =>
    type.endsWith('::custody::VaultReceipt'),
  );
  if (receiptEntry === undefined) {
    throw new Error(`no receipt created; objectTypes ${JSON.stringify(objectTypes)}`);
  }
  const receiptObjectId = receiptEntry[0];
  process.stdout.write(`issued receipt ${receiptObjectId} (digest ${issued.Transaction.digest})\n`);

  // Step 2: member opens a pledge, sponsored by the operator, through the
  // gateway the api uses.
  const gateway = new GrpcSponsoredTransactionGateway(client, operator);
  const sponsored = await gateway.build(memberAddress, (transaction) => {
    appendOpenPledge(transaction, deployment, {
      receiptObjectId,
      requestedPrincipalBaseUnits: 100_000_000n,
      requestedAprBps: 3600,
    });
  });
  const memberSignature = (await member.signTransaction(fromBase64(sponsored.transactionBytes)))
    .signature;
  const execution = await gateway.execute(sponsored.transactionBytes, memberSignature);
  const pledgeEntry = Object.entries(execution.objectTypes).find(([, type]) =>
    type.includes('::pledge::Pledge<'),
  );
  process.stdout.write(
    `SPONSORED OPEN OK: digest ${execution.digest}, pledge ${pledgeEntry?.[0] ?? '(not found)'}\n`,
  );
  process.stdout.write(`events: ${JSON.stringify(execution.events.map((event) => event.name))}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
