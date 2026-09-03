import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { CHAIN_CLIENT } from '../../infrastructure/chain/chain.tokens';
import { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';
import { failureOf } from '../../infrastructure/chain/chain-result';
import { OperatorSigner } from '../../infrastructure/chain/operator-signer';

/* The testnet faucet. The operator mints a fixed amount of the stand-in USDC
   to a member's wallet, so a member needs no external faucet and no SUI to
   start. It works only where the deployment ships its own mintable coin, which
   is the testnet stand-in; a deployment settling in a coin it does not control
   has no treasury to mint from and refuses. This is an operator action, not a
   sponsored member one: the member does not sign a mint of a coin they do not
   own. */
const grantBaseUnits = 1_000_000_000n;

@Injectable()
export class UsdcFaucetService {
  constructor(
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    private readonly operator: OperatorSigner,
    private readonly deployments: ChainDeploymentRegistry,
  ) {}

  async grantTo(address: string): Promise<{ digest: string }> {
    const deployment = this.deployments.current();
    const treasuryCapId = deployment.treasuryCapId;
    if (treasuryCapId === null) {
      throw new Error('This deployment has no mintable coin to grant');
    }
    const transaction = new Transaction();
    const minted = transaction.moveCall({
      target: '0x2::coin::mint',
      typeArguments: [deployment.settlementCoinType],
      arguments: [transaction.object(treasuryCapId), transaction.pure.u64(grantBaseUnits)],
    });
    transaction.transferObjects([minted], address);
    const result = await this.client.core.signAndExecuteTransaction({
      transaction,
      signer: this.operator.keypair,
      include: { effects: true },
    });
    if (result.$kind === 'FailedTransaction') {
      throw failureOf(result.FailedTransaction.status);
    }
    await this.client.waitForTransaction({ digest: result.Transaction.digest });
    return { digest: result.Transaction.digest };
  }
}
