export type SuiNetwork = 'localnet' | 'testnet' | 'mainnet';

export interface ChainConfiguration {
  readonly network: SuiNetwork;
  readonly grpcUrl: string;
  /* Only a local network has one; on a public network the operator is
     funded by a person. */
  readonly faucetUrl: string | null;
  /* The bech32 `suiprivkey` of the key holding the three capabilities. */
  readonly operatorSecretKey: string;
  /* Hex seed the member addresses derive from for accounts that never
     signed in with a wallet of their own. */
  readonly accountSeed: string;
}

export class ChainConfigurationMissing extends Error {
  constructor(readonly variable: string) {
    super(`${variable} must be set when a chain driver is on`);
    this.name = 'ChainConfigurationMissing';
  }
}

const endpointsByNetwork: Record<SuiNetwork, { grpcUrl: string; faucetUrl: string | null }> = {
  localnet: { grpcUrl: 'http://127.0.0.1:9000', faucetUrl: 'http://127.0.0.1:9123' },
  testnet: { grpcUrl: 'https://fullnode.testnet.sui.io:443', faucetUrl: null },
  mainnet: { grpcUrl: 'https://fullnode.mainnet.sui.io:443', faucetUrl: null },
};

function networkFrom(raw: string | undefined): SuiNetwork {
  if (raw === undefined || raw === '') {
    return 'testnet';
  }
  if (raw === 'localnet' || raw === 'testnet' || raw === 'mainnet') {
    return raw;
  }
  throw new Error(`SUI_NETWORK must be localnet, testnet or mainnet, got ${raw}`);
}

export interface NetworkEndpoints {
  readonly network: SuiNetwork;
  readonly grpcUrl: string;
}

/* The read only endpoints for the configured network, without the operator
   keys loadChainConfiguration demands. Verifying a zkLogin sign in needs a
   full node to read the network's JWKs and current epoch, and it runs whether
   or not the settlement chain driver is on. */
export function readNetworkEndpoints(): NetworkEndpoints {
  const network = networkFrom(process.env.SUI_NETWORK);
  return {
    network,
    grpcUrl: process.env.SUI_GRPC_URL ?? endpointsByNetwork[network].grpcUrl,
  };
}

function required(variable: string): string {
  const value = process.env[variable];
  if (value === undefined || value === '') {
    throw new ChainConfigurationMissing(variable);
  }
  return value;
}

/* Read only when a chain driver is on, so a Phase 1 process never has to
   carry chain variables it does not use. */
export function loadChainConfiguration(): ChainConfiguration {
  const network = networkFrom(process.env.SUI_NETWORK);
  const endpoints = endpointsByNetwork[network];
  const faucetUrl = process.env.SUI_FAUCET_URL;
  return {
    network,
    grpcUrl: process.env.SUI_GRPC_URL ?? endpoints.grpcUrl,
    faucetUrl: faucetUrl === undefined ? endpoints.faucetUrl : faucetUrl === '' ? null : faucetUrl,
    operatorSecretKey: required('SUI_OPERATOR_SECRET_KEY'),
    accountSeed: required('SUI_ACCOUNT_SEED'),
  };
}
