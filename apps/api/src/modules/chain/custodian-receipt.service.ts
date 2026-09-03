import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import type { ItemCategory } from '../../domain/custody/item-category';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { CHAIN_CLIENT } from '../../infrastructure/chain/chain.tokens';
import { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';
import { executionOf, failureOf } from '../../infrastructure/chain/chain-result';
import { OperatorSigner } from '../../infrastructure/chain/operator-signer';
import { appendIssueReceipt } from '../../infrastructure/chain/ptb/custody-calls';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';

export interface IssueReceiptCommand {
  readonly holder: string;
  readonly name: string;
  readonly vault: string;
  readonly appraisedValueBaseUnits: string;
  readonly itemCategory: ItemCategory;
  readonly insuranceReference: string;
  readonly mainImage: string;
  readonly secondaryImages: readonly string[];
}

export class ReceiptNotCreated extends Error {
  constructor() {
    super('The issue transaction created no receipt');
    this.name = 'ReceiptNotCreated';
  }
}

/* The one custodial write: the operator, holding the CustodianCap, mints a
   VaultReceipt to a member's wallet after a person has appraised the item and
   taken it in. Operator-signed, not sponsored, because the member does not hold
   the authority to attest their own item exists. The receipt then lands in the
   member's wallet as an owned object, and every step after it is the member's
   own signature. */
@Injectable()
export class CustodianReceiptService {
  constructor(
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    private readonly operator: OperatorSigner,
    private readonly deployments: ChainDeploymentRegistry,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async issue(
    command: IssueReceiptCommand,
  ): Promise<{ receiptObjectId: string; receiptKey: string; digest: string }> {
    const deployment = this.deployments.current();
    /* The name and photographs are stored off chain first; the receipt then
       carries the key that finds them and the hash that commits to them. */
    const { receiptKey, intakeHash } = await this.metadata.create({
      name: command.name,
      mainImage: command.mainImage,
      secondaryImages: command.secondaryImages,
    });
    const transaction = new Transaction();
    appendIssueReceipt(transaction, deployment, {
      receiptKey,
      vault: command.vault,
      holder: command.holder,
      intakeHash,
      appraisedValueBaseUnits: BigInt(command.appraisedValueBaseUnits),
      /* Real chain time; the demo clock never reaches an operator-signed tx. */
      appraisedAtMs: BigInt(Date.now()),
      itemCategory: command.itemCategory,
      insuranceReference: command.insuranceReference,
    });
    const result = await this.client.core.signAndExecuteTransaction({
      transaction,
      signer: this.operator.keypair,
      include: { effects: true, events: true, objectTypes: true },
    });
    if (result.$kind === 'FailedTransaction') {
      throw failureOf(result.FailedTransaction.status);
    }
    await this.client.waitForTransaction({ digest: result.Transaction.digest });
    const execution = executionOf(result.Transaction);
    const receipt = Object.entries(execution.objectTypes).find(([, type]) =>
      type.endsWith('::custody::VaultReceipt'),
    );
    if (receipt === undefined) {
      throw new ReceiptNotCreated();
    }
    return { receiptObjectId: receipt[0], receiptKey, digest: execution.digest };
  }
}
