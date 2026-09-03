import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainDeployment } from '../chain-deployment';

/* Every pledge transition is signed by the acting member, so these builders
   take only the shared objects and the member's own inputs. The api builds
   the transaction; the member's wallet signs and executes it. */
function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::pledge::${name}`;
}

export function appendOpenPledge(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string; readonly requestedAprBps: number },
): void {
  transaction.moveCall({
    target: target(deployment, 'open'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.receiptObjectId),
      transaction.pure.u16(input.requestedAprBps),
    ],
  });
}

export function appendCancelPledge(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly pledgeObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'cancel'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.pledgeObjectId)],
  });
}

export function appendAcceptOffer(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly pledgeObjectId: string; readonly holdObjectId: string; readonly termMs: bigint },
): void {
  transaction.moveCall({
    target: target(deployment, 'accept'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.pledgeObjectId),
      transaction.object(input.holdObjectId),
      transaction.object(deployment.configId),
      transaction.pure.u64(input.termMs),
      transaction.object.clock(),
    ],
  });
}

export function appendRepay(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly pledgeObjectId: string;
    readonly borrowerNoteObjectId: string;
    readonly payment: TransactionObjectArgument;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'repay'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.pledgeObjectId),
      transaction.object(input.borrowerNoteObjectId),
      input.payment,
      transaction.object.clock(),
    ],
  });
}

export function appendCollect(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly pledgeObjectId: string; readonly lenderNoteObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'collect'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.pledgeObjectId),
      transaction.object(input.lenderNoteObjectId),
    ],
  });
}

export function appendClaimDefault(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly pledgeObjectId: string; readonly lenderNoteObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'claim_default'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.pledgeObjectId),
      transaction.object(input.lenderNoteObjectId),
      transaction.object.clock(),
    ],
  });
}
