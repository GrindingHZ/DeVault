import type { Transaction } from '@mysten/sui/transactions';
import { itemCategories } from '../../../domain/custody/item-category';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import type { ChainDeployment } from '../chain-deployment';

function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::config::${name}`;
}

export function appendPause(transaction: Transaction, deployment: ChainDeployment): void {
  transaction.moveCall({
    target: target(deployment, 'pause'),
    arguments: [
      transaction.object(deployment.adminCapId),
      transaction.object(deployment.configId),
      transaction.object.clock(),
    ],
  });
}

export function appendUnpause(transaction: Transaction, deployment: ChainDeployment): void {
  transaction.moveCall({
    target: target(deployment, 'unpause'),
    arguments: [
      transaction.object(deployment.adminCapId),
      transaction.object(deployment.configId),
      transaction.object.clock(),
    ],
  });
}

/* The loan to value vector is written in item-category.ts order, which is
   the order the chain config indexes by. */
export function appendSetParameters(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly parameters: ProtocolParameters; readonly effectiveAtMs: bigint },
): void {
  const parameters = input.parameters;
  const built = transaction.moveCall({
    target: target(deployment, 'new_parameters'),
    arguments: [
      transaction.pure.vector(
        'u16',
        itemCategories.map((category) => parameters.maxLoanToValueBasisPointsByCategory[category]),
      ),
      transaction.pure.u16(parameters.maxAnnualPercentageRateBasisPoints),
      transaction.pure.u64(parameters.minimumOfferLifetimeMs),
      transaction.pure.u16(parameters.originationFeeBasisPoints),
      transaction.pure.u16(parameters.liquidationFeeBasisPoints),
      transaction.pure.u64(parameters.gracePeriodMs),
      transaction.pure.u64(parameters.statutoryHoldingPeriodMs),
      transaction.pure.bool(parameters.notesTransferable),
      transaction.pure.u64(input.effectiveAtMs),
    ],
  });
  transaction.moveCall({
    target: target(deployment, 'set_parameters'),
    arguments: [
      transaction.object(deployment.adminCapId),
      transaction.object(deployment.configId),
      built,
    ],
  });
}
