import type { Transaction } from '@mysten/sui/transactions';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type { ChainDeployment } from '../chain-deployment';
import { bytesOf, itemCategoryCodes } from './codec';

function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::custody::${name}`;
}

export function appendIssueReceipt(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly receiptKey: string;
    readonly vault: string;
    readonly holder: string;
    readonly intakeHash: string;
    readonly appraisedValue: bigint;
    readonly appraisedAtMs: bigint;
    readonly itemCategory: ItemCategory;
    readonly insuranceReference: string;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'issue'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.pure.vector('u8', bytesOf(input.receiptKey)),
      transaction.pure.vector('u8', bytesOf(input.vault)),
      transaction.pure.address(input.holder),
      transaction.pure.vector('u8', bytesOf(input.intakeHash)),
      transaction.pure.u64(input.appraisedValue),
      transaction.pure.u64(input.appraisedAtMs),
      transaction.pure.u8(itemCategoryCodes[input.itemCategory]),
      transaction.pure.vector('u8', bytesOf(input.insuranceReference)),
      transaction.object.clock(),
    ],
  });
}

export function appendTransferHolder(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string; readonly to: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'transfer_holder'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
      transaction.pure.address(input.to),
    ],
  });
}

export function appendEncumber(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string; readonly loanKey: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'encumber'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
      transaction.pure.vector('u8', bytesOf(input.loanKey)),
    ],
  });
}

export function appendReleaseEncumbrance(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'release_encumbrance'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
    ],
  });
}

export function appendClaim(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string; readonly claimant: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'claim'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
      transaction.pure.address(input.claimant),
    ],
  });
}

export function appendBurnForRedemption(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'burn_for_redemption'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
    ],
  });
}

export function appendBurnForLiquidation(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: { readonly receiptObjectId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'burn_for_liquidation'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
    ],
  });
}

export function appendReissueToBuyer(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: {
    readonly receiptObjectId: string;
    readonly newReceiptKey: string;
    readonly buyer: string;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'reissue_to_buyer'),
    arguments: [
      transaction.object(deployment.custodianCapId),
      transaction.object(input.receiptObjectId),
      transaction.pure.vector('u8', bytesOf(input.newReceiptKey)),
      transaction.pure.address(input.buyer),
      transaction.object.clock(),
    ],
  });
}
