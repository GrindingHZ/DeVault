import type { Transaction } from '@mysten/sui/transactions';
import type { ChainDeployment } from '../chain-deployment';
import { bytesOf } from './codec';

export function appendAttest(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly eventType: string;
    readonly payload: string;
  },
): void {
  transaction.moveCall({
    target: `${deployment.packageId}::attestation::attest`,
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.pure.vector('u8', bytesOf(input.subjectType)),
      transaction.pure.vector('u8', bytesOf(input.subjectId)),
      transaction.pure.vector('u8', bytesOf(input.eventType)),
      transaction.pure.vector('u8', bytesOf(input.payload)),
      transaction.object.clock(),
    ],
  });
}
