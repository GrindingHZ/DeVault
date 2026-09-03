import {
  chainDeploymentResponseSchema,
  issueVaultReceiptResponseSchema,
  listingsResponseSchema,
  receiptMetadataResponseSchema,
  releaseQueueResponseSchema,
  walletResponseSchema,
} from '../chain-actions';
import type {
  ChainDeploymentResponse,
  IssueVaultReceiptRequest,
  IssueVaultReceiptResponse,
  ListingsResponse,
  ReceiptMetadataResponse,
  ReleaseQueueResponse,
  WalletResponse,
} from '../chain-actions';
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

/* The signed-in member's money, computed by the api from the chain. */
export function fetchWallet(): Promise<WalletResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/wallet`,
    responseSchema: walletResponseSchema,
  });
}

/* The open market, read from the chain: pledges a borrower has opened for a
   lender to browse and offer against. */
export function fetchListings(): Promise<ListingsResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/listings`,
    responseSchema: listingsResponseSchema,
  });
}

/* Vault staff read the release queue from the chain: members who burned their
   receipt with redeem and are waiting to collect the item at the counter. */
export function fetchReleaseQueue(): Promise<ReleaseQueueResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/releases`,
    responseSchema: releaseQueueResponseSchema,
  });
}

/* Vault staff issue a receipt on chain to a member's wallet. */
export function issueVaultReceipt(body: IssueVaultReceiptRequest): Promise<IssueVaultReceiptResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/chain/receipts/issue`,
    body,
    responseSchema: issueVaultReceiptResponseSchema,
  });
}

/* The name and photographs behind a receipt, keyed by the receipt_key it
   carries on chain. */
export function fetchReceiptMetadata(receiptKey: string): Promise<ReceiptMetadataResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/chain/receipts/${encodeURIComponent(receiptKey)}/metadata`,
    responseSchema: receiptMetadataResponseSchema,
  });
}
