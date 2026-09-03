import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainDeployment } from '../chain-deployment';

/* Selling a loan position is transferring the lender note through a shared
   listing that swaps it for the buyer's coin atomically. Both sides are
   signed by the member who acts (the seller lists, the buyer buys). */
function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::market::${name}`;
}

export function appendListPosition(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly lenderNoteObjectId: string; readonly askBaseUnits: bigint },
): void {
  transaction.moveCall({
    target: target(deployment, 'list_position'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.lenderNoteObjectId),
      transaction.pure.u64(input.askBaseUnits),
    ],
  });
}

export function appendBuyPosition(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly listingObjectId: string; readonly payment: TransactionObjectArgument },
): void {
  transaction.moveCall({
    target: target(deployment, 'buy_position'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.listingObjectId), input.payment],
  });
}

export function appendDelistPosition(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly listingObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'delist_position'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.listingObjectId)],
  });
}
