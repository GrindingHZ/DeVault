import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { ChainConfiguration, NetworkEndpoints } from '../../config/chain-configuration';

/* gRPC on the full node for everything the api does: submissions, object
   reads, and the event stream the indexer follows. JSON-RPC is deprecated
   and is not used anywhere (docs/08-web3-migration.md). */
export type ChainClient = SuiGrpcClient;

export function createChainClient(configuration: ChainConfiguration): ChainClient {
  return createReadOnlyChainClient(configuration);
}

/* A client that only reads: no operator key behind it. Used to verify zkLogin
   sign ins against the network's JWKs, which needs a full node but no ability
   to sign or submit. */
export function createReadOnlyChainClient(endpoints: NetworkEndpoints): ChainClient {
  return new SuiGrpcClient({ network: endpoints.network, baseUrl: endpoints.grpcUrl });
}
