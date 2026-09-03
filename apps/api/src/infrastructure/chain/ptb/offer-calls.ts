import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainDeployment } from '../chain-deployment';
import { bytesOf } from './codec';

/* An offer is the lender's own coin locked in a shared hold against a pledge.
   The lender signs `make_offer`; a refund is pull, so anyone may trigger it
   once the offer has expired or lost, and the coin only ever goes home. */
function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::escrow::${name}`;
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
    target: target(deployment, 'make_offer'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(deployment.configId),
      transaction.pure.id(input.pledgeObjectId),
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
    target: target(deployment, 'refund_expired'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [transaction.object(input.holdObjectId), transaction.object.clock()],
  });
}

export function appendRefundLosing(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly holdObjectId: string;
    readonly pledgeMatched: boolean;
    readonly acceptedHoldKey: string;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'refund_losing'),
    typeArguments: [deployment.settlementCoinType],
    arguments: [
      transaction.object(input.holdObjectId),
      transaction.pure.bool(input.pledgeMatched),
      transaction.pure.vector('u8', bytesOf(input.acceptedHoldKey)),
    ],
  });
}
