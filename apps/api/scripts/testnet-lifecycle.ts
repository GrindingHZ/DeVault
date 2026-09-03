import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { PrismaClient } from '@prisma/client';
import { loadChainConfiguration } from '../src/config/chain-configuration';
import { loadConfiguration } from '../src/config/configuration';
import type { ChainExecution } from '../src/infrastructure/chain/chain-execution';
import { createChainClient } from '../src/infrastructure/chain/chain-client';
import { readDeployment } from '../src/infrastructure/chain/chain-deployment.registry';
import { executionOf, failureOf } from '../src/infrastructure/chain/chain-result';
import { GrpcSponsoredTransactionGateway } from '../src/infrastructure/chain/grpc-sponsored-transaction';
import { OperatorSigner } from '../src/infrastructure/chain/operator-signer';
import { appendIssueReceipt } from '../src/infrastructure/chain/ptb/custody-calls';
import { appendMakeOffer } from '../src/infrastructure/chain/ptb/offer-calls';
import { appendAcceptOffer, appendCollect, appendOpenPledge, appendRepay } from '../src/infrastructure/chain/ptb/pledge-calls';

/* The whole money path on live testnet: mint USDC, open a pledge, make an
   offer, accept it, repay, and collect. It proves the fee split, the note
   minting, the disbursement, and the sponsored signatures against the real
   chain, which no unit test can. */
async function main(): Promise<void> {
  const configuration = loadChainConfiguration();
  const client = createChainClient(configuration);
  const operator = new OperatorSigner(configuration);
  const gateway = new GrpcSponsoredTransactionGateway(client, operator);
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const deployment = await readDeployment(prisma);
  await prisma.$disconnect();
  if (deployment === null) {
    throw new Error('No deployment recorded');
  }
  const coinType = deployment.settlementCoinType;
  const treasury = deployment.treasuryCapId ?? '';
  const stamp = Date.now().toString();

  const borrower = Ed25519Keypair.generate();
  const lender = Ed25519Keypair.generate();
  const borrowerAddress = borrower.toSuiAddress();
  const lenderAddress = lender.toSuiAddress();
  log(`borrower ${borrowerAddress}`);
  log(`lender   ${lenderAddress}`);

  async function operatorExecute(append: (tx: Transaction) => void): Promise<ChainExecution> {
    const transaction = new Transaction();
    append(transaction);
    const result = await client.core.signAndExecuteTransaction({
      transaction,
      signer: operator.keypair,
      include: { effects: true, events: true, objectTypes: true },
    });
    if (result.$kind === 'FailedTransaction') {
      throw failureOf(result.FailedTransaction.status);
    }
    await client.waitForTransaction({ digest: result.Transaction.digest });
    return executionOf(result.Transaction);
  }

  async function sponsoredExecute(
    member: Ed25519Keypair,
    append: (tx: Transaction) => void,
  ): Promise<ChainExecution> {
    const sponsored = await gateway.build(member.toSuiAddress(), append);
    const signature = (await member.signTransaction(fromBase64(sponsored.transactionBytes))).signature;
    const execution = await gateway.execute(sponsored.transactionBytes, signature);
    await client.waitForTransaction({ digest: execution.digest });
    return execution;
  }

  const createdOfType = (execution: ChainExecution, test: (type: string) => boolean): string => {
    const entry = Object.entries(execution.objectTypes).find(([, type]) => test(type));
    if (entry === undefined) {
      throw new Error(`no created object of the wanted type in ${JSON.stringify(execution.objectTypes)}`);
    }
    return entry[0];
  };
  const coinTest = (type: string): boolean => type.includes('::coin::Coin<') && type.includes(coinType);

  async function mintUsdc(to: string, amount: bigint): Promise<string> {
    const execution = await operatorExecute((tx) => {
      const coin = tx.moveCall({
        target: '0x2::coin::mint',
        typeArguments: [coinType],
        arguments: [tx.object(treasury), tx.pure.u64(amount)],
      });
      tx.transferObjects([coin], to);
    });
    return createdOfType(execution, coinTest);
  }

  // 1. Fund the lender and the borrower with USDC.
  const lenderCoin = await mintUsdc(lenderAddress, 400_000n);
  await mintUsdc(borrowerAddress, 100_000n);
  log(`minted usdc: lender coin ${lenderCoin}`);

  // 2. Operator issues a receipt to the borrower.
  const issued = await operatorExecute((tx) => {
    appendIssueReceipt(tx, deployment, {
      receiptKey: `LC-${stamp}`,
      vault: 'VAULT-1',
      holder: borrowerAddress,
      intakeHash: 'sha256:lifecycle',
      appraisedValueBaseUnits: 800_000n,
      appraisedAtMs: BigInt(Date.now()),
      itemCategory: 'BULLION',
      insuranceReference: 'POL-LC',
    });
  });
  const receipt = createdOfType(issued, (type) => type.endsWith('::custody::VaultReceipt'));
  log(`receipt ${receipt}`);

  // 3. Borrower opens a pledge (sponsored).
  const opened = await sponsoredExecute(borrower, (tx) => {
    appendOpenPledge(tx, deployment, { receiptObjectId: receipt, requestedAprBps: 3600 });
  });
  const pledge = createdOfType(opened, (type) => type.includes('::pledge::Pledge<'));
  log(`pledge ${pledge}`);

  // 4. Lender makes an offer of the whole minted coin (sponsored).
  const offered = await sponsoredExecute(lender, (tx) => {
    appendMakeOffer(tx, deployment, {
      pledgeObjectId: pledge,
      holdKey: `HOLD-${stamp}`,
      payment: tx.object(lenderCoin) as TransactionObjectArgument,
      expiresAtMs: BigInt(Date.now() + 700_000),
    });
  });
  const hold = createdOfType(offered, (type) => type.includes('::escrow::FundsHold<'));
  log(`hold ${hold}, events ${offered.events.map((e) => e.name).join(',')}`);

  // 5. Borrower accepts the offer (sponsored). Principal minus fee lands on the borrower.
  const accepted = await sponsoredExecute(borrower, (tx) => {
    appendAcceptOffer(tx, deployment, { pledgeObjectId: pledge, holdObjectId: hold, termMs: 2_592_000_000n });
  });
  log(`accepted, events ${accepted.events.map((e) => e.name).join(',')}`);
  const borrowerNote = createdOfType(accepted, (type) => type.includes('::notes::BorrowerNote'));
  const lenderNote = createdOfType(accepted, (type) => type.includes('::notes::LenderNote'));
  log(`borrowerNote ${borrowerNote}, lenderNote ${lenderNote}`);

  // 6. Borrower repays with a fresh coin covering principal plus interest.
  const repayCoin = await mintUsdc(borrowerAddress, 450_000n);
  const repaid = await sponsoredExecute(borrower, (tx) => {
    appendRepay(tx, deployment, {
      pledgeObjectId: pledge,
      borrowerNoteObjectId: borrowerNote,
      payment: tx.object(repayCoin) as TransactionObjectArgument,
    });
  });
  log(`repaid, events ${repaid.events.map((e) => e.name).join(',')}`);

  // 7. Lender collects the parked payoff (sponsored).
  const collected = await sponsoredExecute(lender, (tx) => {
    appendCollect(tx, deployment, { pledgeObjectId: pledge, lenderNoteObjectId: lenderNote });
  });
  log(`collected, events ${collected.events.map((e) => e.name).join(',')}`);
  log('LIFECYCLE OK: open, offer, accept, repay, collect all executed on testnet');
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
