import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfiguration, SuiNetwork } from '../../../config/chain-configuration';
import type { ChainClient } from '../chain-client';
import type { ChainDeployment } from '../chain-deployment';
import { recordDeployment } from '../chain-deployment.registry';
import type { OperatorSigner } from '../operator-signer';
import { buildPackage } from './build-package';

export interface PublishPackageInput {
  readonly client: ChainClient;
  readonly signer: OperatorSigner;
  readonly prisma: PrismaClient;
  readonly configuration: ChainConfiguration;
  readonly repositoryRoot: string;
}

/* Circle's USDC on the public networks. The local network has no USDC, so
   the package's own stand in is the settlement coin there. */
const circleUsdcByNetwork: Record<Exclude<SuiNetwork, 'localnet'>, string> = {
  testnet: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
  mainnet: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
};

const usdcDecimals = 6;

/* Enough gas for a publish and the demo's transactions; a local faucet hands
   out far more per request. */
const minimumOperatorGasMist = 1_000_000_000n;

/* Builds, publishes, reads the created objects out of the effects, and
   records the deployment the adapters boot from. The upgrade capability goes
   to the operator, because a package made immutable on day one cannot have
   its bugs fixed (docs/08-web3-migration.md). */
export async function publishPackage(input: PublishPackageInput): Promise<ChainDeployment> {
  await ensureOperatorGas(input);
  const compiled = buildPackage(input.repositoryRoot);

  const transaction = new Transaction();
  const upgradeCap = transaction.publish({
    modules: [...compiled.modules],
    dependencies: [...compiled.dependencies],
  });
  transaction.transferObjects([upgradeCap], input.signer.address);

  const result = await input.client.core.signAndExecuteTransaction({
    transaction,
    signer: input.signer.keypair,
    include: { effects: true, objectTypes: true },
  });
  if (result.$kind === 'FailedTransaction') {
    throw new Error(
      `Publishing the package failed: ${result.FailedTransaction.status.error?.message ?? 'unknown'}`,
    );
  }
  await input.client.waitForTransaction({ digest: result.Transaction.digest });

  const packageWrite = result.Transaction.effects.changedObjects.find(
    (changed) => changed.outputState === 'PackageWrite',
  );
  if (packageWrite === undefined) {
    throw new Error('The publish transaction created no package');
  }
  const packageId = normalizeSuiAddress(packageWrite.objectId);
  const objectTypes: Record<string, string> = result.Transaction.objectTypes ?? {};
  const objectOfType = (suffix: string): string => {
    const match = Object.entries(objectTypes).find(([, type]) => type.endsWith(suffix));
    if (match === undefined) {
      throw new Error(`The publish transaction created no ${suffix}`);
    }
    return match[0];
  };
  const treasuryCap = Object.entries(objectTypes).find(([, type]) =>
    /::coin::TreasuryCap<.*::usdc::USDC>$/.test(type),
  );

  const network = input.configuration.network;
  const deployment: ChainDeployment = {
    network,
    packageId,
    configId: objectOfType('::config::Config'),
    adminCapId: objectOfType('::config::AdminCap'),
    operatorCapId: objectOfType('::config::OperatorCap'),
    custodianCapId: objectOfType('::config::CustodianCap'),
    treasuryCapId: treasuryCap === undefined ? null : treasuryCap[0],
    /* Circle's own USDC is the settlement coin on a public network, so a member
       funds themselves from Circle's faucet and the coin is the same shape it
       is on mainnet. The local network has no Circle USDC, so there the package
       settles in its own stand in, which is the only reason it still ships one. */
    settlementCoinType:
      network === 'localnet' ? `${packageId}::usdc::USDC` : circleUsdcByNetwork[network],
    settlementCoinDecimals: usdcDecimals,
    publishedAt: new Date(),
    publishedBy: input.signer.address,
  };
  await recordDeployment(input.prisma, deployment);
  return deployment;
}

/* A local faucet is the only way the operator gets gas without a person; on
   a public network a low balance is reported and a person tops it up. */
async function ensureOperatorGas(input: PublishPackageInput): Promise<void> {
  const balanceOf = async (): Promise<bigint> => {
    const response = await input.client.getBalance({ owner: input.signer.address });
    return BigInt(response.balance.balance);
  };
  if ((await balanceOf()) >= minimumOperatorGasMist) {
    return;
  }
  if (input.configuration.faucetUrl === null) {
    throw new Error(
      `The operator ${input.signer.address} holds too little SUI for gas on ${input.configuration.network}`,
    );
  }
  await requestSuiFromFaucetV2({
    host: input.configuration.faucetUrl,
    recipient: input.signer.address,
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await balanceOf()) >= minimumOperatorGasMist) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The faucet did not fund the operator in time');
}
