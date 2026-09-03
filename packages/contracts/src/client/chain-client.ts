import {
  chainActivityResponseSchema,
  chainDeploymentResponseSchema,
  chainExecutionResponseSchema,
  issueVaultReceiptResponseSchema,
  listingsResponseSchema,
  receiptMetadataResponseSchema,
  releaseQueueResponseSchema,
  sponsoredTransactionResponseSchema,
  walletResponseSchema,
} from '../chain-actions';
import type {
  AcceptOfferAction,
  ChainActivityResponse,
  BuildAcceptOfferRequest,
  BuildBuyPositionRequest,
  BuildCancelPledgeRequest,
  BuildDelistPositionRequest,
  BuildListPositionRequest,
  BuildMakeOfferRequest,
  BuildOpenPledgeRequest,
  BuildRedeemRequest,
  BuildRepayRequest,
  BuildSettlePledgeRequest,
  BuyPositionAction,
  ChainDeploymentResponse,
  DelistPositionAction,
  ListPositionAction,
  MakeOfferAction,
  OpenPledgeAction,
  PledgeAction,
  ReclaimHoldAction,
  RedeemAction,
  ChainExecutionResponse,
  ExecuteChainActionRequest,
  IssueVaultReceiptRequest,
  IssueVaultReceiptResponse,
  ListingsResponse,
  ReceiptMetadataResponse,
  ReleaseQueueResponse,
  SponsoredTransactionResponse,
  WalletResponse,
} from '../chain-actions';
import { requestJson } from './http';

/* The sponsored write surface: the api builds a transaction the member's wallet
   signs, then the member posts the signature back and the api sponsor-signs and
   submits. Each builder returns the unsigned transaction bytes. */
function buildSponsored(path: string, body: unknown): Promise<SponsoredTransactionResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}${path}`,
    body,
    responseSchema: sponsoredTransactionResponseSchema,
  });
}

export function buildOpenPledge(
  body: BuildOpenPledgeRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/pledges/build', body);
}
export function buildCancelPledge(
  body: BuildCancelPledgeRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/pledges/cancel/build', body);
}
export function buildMakeOffer(body: BuildMakeOfferRequest): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/offers/build', body);
}
export function buildAcceptOffer(
  body: BuildAcceptOfferRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/offers/accept/build', body);
}
export function buildRepay(body: BuildRepayRequest): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/loans/repay/build', body);
}
export function buildCollect(
  body: BuildSettlePledgeRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/loans/collect/build', body);
}
export function buildClaimDefault(
  body: BuildSettlePledgeRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/loans/claim/build', body);
}
export function buildRedeem(body: BuildRedeemRequest): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/receipts/redeem/build', body);
}
export function buildListPosition(
  body: BuildListPositionRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/positions/build', body);
}
export function buildBuyPosition(
  body: BuildBuyPositionRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/positions/buy/build', body);
}
export function buildDelistPosition(
  body: BuildDelistPositionRequest,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/positions/delist/build', body);
}

/* The high-level actions: the member names only what a screen shows, and the
   api resolves the coin, note, and receipt object ids before it builds. */
export function openPledgeAction(body: OpenPledgeAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/open-pledge', body);
}
export function makeOfferAction(body: MakeOfferAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/make-offer', body);
}
export function acceptOfferAction(body: AcceptOfferAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/accept-offer', body);
}
export function repayAction(body: PledgeAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/repay', body);
}
export function collectAction(body: PledgeAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/collect', body);
}
export function claimAction(body: PledgeAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/claim', body);
}
export function cancelPledgeAction(body: PledgeAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/cancel-pledge', body);
}
export function redeemAction(body: RedeemAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/redeem', body);
}
export function listPositionAction(
  body: ListPositionAction,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/list-position', body);
}
export function buyPositionAction(body: BuyPositionAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/buy-position', body);
}
export function delistPositionAction(
  body: DelistPositionAction,
): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/delist-position', body);
}
export function reclaimHoldAction(body: ReclaimHoldAction): Promise<SponsoredTransactionResponse> {
  return buildSponsored('/chain/actions/reclaim-hold', body);
}

/* The member posts the signed transaction bytes back; the api sponsor-signs and
   submits, and answers with the digest and the objects the action created. */
export function executeChainAction(
  body: ExecuteChainActionRequest,
): Promise<ChainExecutionResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/chain/execute`,
    body,
    responseSchema: chainExecutionResponseSchema,
  });
}

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
export function issueVaultReceipt(
  body: IssueVaultReceiptRequest,
): Promise<IssueVaultReceiptResponse> {
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

/* The member's own on-chain history: one row per transaction, with the hashes
   that prove it on a Sui explorer. */
export function fetchChainActivity(): Promise<ChainActivityResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/activity`,
    responseSchema: chainActivityResponseSchema,
  });
}
