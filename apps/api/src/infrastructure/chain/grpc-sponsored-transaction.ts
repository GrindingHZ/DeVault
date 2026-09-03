import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import type { ChainClient } from './chain-client';
import type { ChainExecution } from './chain-execution';
import { executionOf, failureOf } from './chain-result';
import type { OperatorSigner } from './operator-signer';
import type { SponsoredTransaction, SponsoredTransactionGateway } from './sponsored-transaction';

/* Builds the member's transaction with the sponsor as gas owner, then on
   execute adds the sponsor's signature to the member's and submits both. The
   member signature is over the same bytes the api built, so the api never
   trusts a transaction the member reshaped. */
export class GrpcSponsoredTransactionGateway implements SponsoredTransactionGateway {
  constructor(
    private readonly client: ChainClient,
    private readonly sponsor: OperatorSigner,
  ) {}

  async build(
    memberAddress: string,
    append: (transaction: Transaction) => void,
  ): Promise<SponsoredTransaction> {
    const transaction = new Transaction();
    append(transaction);
    transaction.setSender(memberAddress);
    transaction.setGasOwner(this.sponsor.address);
    const bytes = await transaction.build({ client: this.client });
    return { transactionBytes: toBase64(bytes) };
  }

  async execute(transactionBytes: string, memberSignature: string): Promise<ChainExecution> {
    const bytes = fromBase64(transactionBytes);
    const sponsorSignature = (await this.sponsor.keypair.signTransaction(bytes)).signature;
    const result = await this.client.core.executeTransaction({
      transaction: bytes,
      signatures: [memberSignature, sponsorSignature],
      include: { effects: true, events: true, objectTypes: true },
    });
    if (result.$kind === 'FailedTransaction') {
      throw failureOf(result.FailedTransaction.status);
    }
    return executionOf(result.Transaction);
  }
}
