import {
  chainDeploymentResponseSchema,
  usdcFaucetResponseSchema,
  walletResponseSchema,
} from '../chain-actions';
import type { ChainDeploymentResponse, UsdcFaucetResponse, WalletResponse } from '../chain-actions';
import { requestJson } from './http';

const basePath = '/api/v1';

/* The active deployment, so the wallet knows the coin type and the package that
   types its notes and receipts. Read once and cached: a process talks to one
   deployment for its whole life. */
export function fetchChainDeployment(): Promise<ChainDeploymentResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/deployment`,
    responseSchema: chainDeploymentResponseSchema,
  });
}

/* Ask the operator to mint testnet USDC into the signed-in member's wallet. */
export function requestTestnetUsdc(): Promise<UsdcFaucetResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/chain/faucet`,
    responseSchema: usdcFaucetResponseSchema,
  });
}

/* The signed-in member's money, computed by the api from the chain. */
export function fetchWallet(): Promise<WalletResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/wallet`,
    responseSchema: walletResponseSchema,
  });
}
