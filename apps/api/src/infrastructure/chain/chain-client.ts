import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { ChainConfiguration } from '../../config/chain-configuration';

/* gRPC on the full node for everything the api does: submissions, object
   reads, and the event stream the indexer follows. JSON-RPC is deprecated
   and is not used anywhere (docs/08-web3-migration.md). */
export type ChainClient = SuiGrpcClient;

export function createChainClient(configuration: ChainConfiguration): ChainClient {
  return new SuiGrpcClient({ network: configuration.network, baseUrl: configuration.grpcUrl });
}
