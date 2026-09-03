import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainDeployment } from '../chain-deployment';
import { bytesOf } from './codec';

/* An offer is the lender's own coin locked in a shared hold against a
   pledge. The lender signs `pledge::offer`, which reads the listing before
   the escrow takes the coin, so the transaction itself fails on a listing
   that has closed. A refund is pull: anyone may trigger it once the offer
   has expired (the escrow, on the clock) or lost (the pledge, on its own
   status), and the coin only ever goes home. */
function target(deployment: ChainDeployment, module: 'escrow' | 'pledge', name: string): string {
  return `${deployment.packageId}::${module}::${name}`;
}

export function appendMakeOffer(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly pledgeObjectId: string;
    readonly holdKey: string;
    readonly payment: TransactionObjectArgument;
    readonly aprBps: number;
    readonly expiresAtMs: bigint;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'pledge', 'offer'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(deployment.configId),
      transaction.object(input.pledgeObjectId),
      transaction.pure.vector('u8', bytesOf(input.holdKey)),
      input.payment,
      transaction.pure.u16(input.aprBps),
      transaction.pure.u64(input.expiresAtMs),
      transaction.object.clock(),
    ],
  });
}

export function appendRefundExpired(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly holdObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'escrow', 'refund_expired'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.holdObjectId), transaction.object.clock()],
  });
}

export function appendRefundLosing(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly pledgeObjectId: string; readonly holdObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'pledge', 'refund_losing'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.pledgeObjectId), transaction.object(input.holdObjectId)],
  });
}
