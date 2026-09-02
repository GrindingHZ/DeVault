import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadChainConfiguration } from '../../src/config/chain-configuration';
import type { ChainConfiguration } from '../../src/config/chain-configuration';
import { createChainClient } from '../../src/infrastructure/chain/chain-client';
import type { ChainClient } from '../../src/infrastructure/chain/chain-client';
import type { ChainDeployment } from '../../src/infrastructure/chain/chain-deployment';
import { OperatorSigner } from '../../src/infrastructure/chain/operator-signer';
import { publishPackage } from '../../src/infrastructure/chain/publish/publish-package';

/* Started by `pnpm chain:localnet`, which runs one validator: see scripts/localnet.sh. */
export const localnetGrpcUrl = process.env.SUI_GRPC_URL ?? 'http://127.0.0.1:9000';

/* The chain suites need a node. CI starts one; a developer without one gets
   a skipped suite naming the address it looked for rather than a stack
   trace from a connection refusal. */
export async function isLocalnetReachable(): Promise<boolean> {
  try {
    const client = createChainClient({
      network: 'localnet',
      grpcUrl: localnetGrpcUrl,
      faucetUrl: null,
      operatorSecretKey: '',
      accountSeed: '',
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out')), 3_000),
    );
    await Promise.race([client.getChainIdentifier(), timeout]);
    return true;
  } catch {
    return false;
  }
}

export interface ChainTestNetwork {
  readonly environment: Readonly<Record<string, string>>;
  readonly configuration: ChainConfiguration;
  readonly client: ChainClient;
  readonly operator: OperatorSigner;
  deployment(): ChainDeployment;
  /* Publishes a fresh package for this suite and records it in the suite's
     database, so no two suites share objects and the deployment is what the
     adapters boot from. */
  prepare(databaseUrl: string): Promise<void>;
}

/* A throwaway operator per suite, funded by the local faucet. */
export function chainTestNetwork(drivers: {
  readonly settlement?: boolean;
  readonly custody?: boolean;
}): ChainTestNetwork {
  const operatorKeypair = new Ed25519Keypair();
  const environment: Record<string, string> = {
    SUI_NETWORK: 'localnet',
    SUI_GRPC_URL: localnetGrpcUrl,
    SUI_OPERATOR_SECRET_KEY: operatorKeypair.getSecretKey(),
    SUI_ACCOUNT_SEED: randomBytes(32).toString('hex'),
    SETTLEMENT_DRIVER: drivers.settlement === true ? 'chain' : 'ledger',
    CUSTODY_DRIVER: drivers.custody === true ? 'chain' : 'database',
  };
  const configuration: ChainConfiguration = {
    ...loadChainConfigurationFrom(environment),
  };
  const client = createChainClient(configuration);
  const operator = new OperatorSigner(configuration);
  let published: ChainDeployment | null = null;

  return {
    environment,
    configuration,
    client,
    operator,
    deployment(): ChainDeployment {
      if (published === null) {
        throw new Error('The package has not been published for this suite');
      }
      return published;
    },
    async prepare(databaseUrl: string): Promise<void> {
      const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
      try {
        published = await publishPackage({
          client,
          signer: operator,
          prisma,
          configuration,
          repositoryRoot: path.resolve(__dirname, '../../../..'),
        });
      } finally {
        await prisma.$disconnect();
      }
    },
  };
}

function loadChainConfigurationFrom(
  environment: Readonly<Record<string, string>>,
): ChainConfiguration {
  const previous = new Map<string, string | undefined>();
  for (const [variable, value] of Object.entries(environment)) {
    previous.set(variable, process.env[variable]);
    process.env[variable] = value;
  }
  try {
    return loadChainConfiguration();
  } finally {
    for (const [variable, value] of previous) {
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
  }
}
