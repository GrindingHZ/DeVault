import { z } from 'zod';

/* The self-custody write surface. Every member action is a two step: the api
   builds a transaction the member's wallet signs, then the member posts the
   signature back and the api sponsor signs and submits. Object ids are the
   on-chain ids the read models carry; base unit amounts are strings because
   they are chain quantities, not the api's cent money. */

const objectId = z.string().min(3);
const baseUnits = z.string().regex(/^\d+$/);

export const sponsoredTransactionResponseSchema = z.object({
  transactionBytes: z.string(),
});
export type SponsoredTransactionResponse = z.infer<typeof sponsoredTransactionResponseSchema>;

export const executeChainActionRequestSchema = z.object({
  transactionBytes: z.string(),
  signature: z.string(),
});
export type ExecuteChainActionRequest = z.infer<typeof executeChainActionRequestSchema>;

export const chainExecutionResponseSchema = z.object({
  digest: z.string(),
  createdObjectIds: z.array(z.string()),
  events: z.array(z.string()),
});
export type ChainExecutionResponse = z.infer<typeof chainExecutionResponseSchema>;

/* What the wallet needs to read a member's money straight from the chain: the
   package that types the notes and the receipt, and the coin the balance is
   denominated in. The frontend names these in getBalance and getOwnedObjects,
   so it can resolve a whole position with no read model in the path. */
export const chainDeploymentResponseSchema = z.object({
  packageId: z.string(),
  settlementCoinType: z.string(),
  settlementCoinDecimals: z.number().int().nonnegative(),
  network: z.enum(['localnet', 'testnet', 'mainnet']),
});
export type ChainDeploymentResponse = z.infer<typeof chainDeploymentResponseSchema>;

/* The member's whole money position, computed by the api from the chain over
   gRPC because a full node no longer answers a browser. Every amount is in the
   settlement coin's base units, so the client formats it with the coin's
   decimals rather than as cents. */
export const walletResponseSchema = z.object({
  decimals: z.number().int().nonnegative(),
  availableBaseUnits: baseUnits,
  lentPrincipalBaseUnits: baseUnits,
  interestEarnedBaseUnits: baseUnits,
  collectableBaseUnits: baseUnits,
  owedNowBaseUnits: baseUnits,
  committedBaseUnits: baseUnits,
  reclaimableBaseUnits: baseUnits,
  cashControlledBaseUnits: baseUnits,
  activeBorrowCount: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      objectId: z.string(),
      appraisedValueBaseUnits: baseUnits,
      itemCategory: z.string(),
      receiptKey: z.string(),
    }),
  ),
  /* The member's loans as a lender: one row per pledge a note of theirs
     funds, with what it has earned and what is theirs to collect once repaid. */
  lender: z.array(
    z.object({
      pledgeId: z.string(),
      status: z.enum(['open', 'active', 'repaid', 'defaulted', 'cancelled', 'closed']),
      principalBaseUnits: baseUnits,
      earnedSoFarBaseUnits: baseUnits,
      valueAtMaturityBaseUnits: baseUnits,
      collectableBaseUnits: baseUnits,
    }),
  ),
  /* The member's loans as a borrower: what each owes now and at maturity, and
     when the grace period runs out. */
  borrower: z.array(
    z.object({
      pledgeId: z.string(),
      status: z.enum(['open', 'active', 'repaid', 'defaulted', 'cancelled', 'closed']),
      owedNowBaseUnits: baseUnits,
      owedAtMaturityBaseUnits: baseUnits,
      graceEndsAtMs: z.number().int().nonnegative(),
    }),
  ),
  /* The member's open offers: the hold that backs each and whether it is still
     committed or now free to reclaim. */
  offers: z.array(
    z.object({
      holdObjectId: z.string(),
      pledgeId: z.string(),
      amountBaseUnits: baseUnits,
      status: z.enum(['committed', 'reclaimable', 'consumed']),
    }),
  ),
});
export type WalletResponse = z.infer<typeof walletResponseSchema>;

/* The release queue the vault counter works from, read straight from the chain.
   A member burns their receipt with custody::redeem, which emits
   RedemptionRequested; staff read the queue, check identity in person, and hand
   the item over. There is no on-chain release step to record, because burning
   the receipt already gave up the claim. */
export const releaseQueueResponseSchema = z.object({
  items: z.array(
    z.object({
      digest: z.string(),
      receiptId: z.string(),
      receiptKey: z.string(),
      holder: z.string(),
    }),
  ),
});
export type ReleaseQueueResponse = z.infer<typeof releaseQueueResponseSchema>;

/* The member's own on-chain history, read from the events their transactions
   emitted. Every row is one transaction, named for what it did, and carries the
   transaction hash and every object it touched so a reader can open each on a
   Sui explorer and see the proof for themselves. A reference is a hash to link
   (the transaction, an object, an account) or a key to show (the receipt key is
   the api's own reference, not an on-chain address). */
export const chainActivityReferenceSchema = z.object({
  label: z.string(),
  value: z.string(),
  kind: z.enum(['transaction', 'object', 'address', 'key']),
});
export type ChainActivityReference = z.infer<typeof chainActivityReferenceSchema>;

export const chainActivityEntrySchema = z.object({
  transactionDigest: z.string(),
  /* A stable code the ui keys its wording and tone off; `label` is the words. */
  kind: z.string(),
  label: z.string(),
  description: z.string(),
  /* Milliseconds since the epoch, or null when the node did not carry a time
     for the event. */
  atMs: z.number().nullable(),
  references: z.array(chainActivityReferenceSchema),
});
export type ChainActivityEntry = z.infer<typeof chainActivityEntrySchema>;

export const chainActivityResponseSchema = z.object({
  items: z.array(chainActivityEntrySchema),
});
export type ChainActivityResponse = z.infer<typeof chainActivityResponseSchema>;

/* The open market, read from the chain: the pledges a borrower has opened and
   not yet had funded, for a lender to browse and offer against. The appraised
   value is the collateral behind the loan; a listing whose collateral shape the
   node did not carry reads as zero and is priced by its rate alone. */
export const listingsResponseSchema = z.object({
  decimals: z.number().int().nonnegative(),
  listings: z.array(
    z.object({
      pledgeId: z.string(),
      borrower: z.string(),
      requestedAprBps: z.number().int().nonnegative(),
      appraisedValueBaseUnits: baseUnits,
      itemCategory: z.string(),
      receiptKey: z.string(),
    }),
  ),
});
export type ListingsResponse = z.infer<typeof listingsResponseSchema>;

export const buildOpenPledgeRequestSchema = z.object({
  receiptObjectId: objectId,
  requestedPrincipalBaseUnits: baseUnits,
  requestedAprBps: z.number().int().nonnegative().max(65_535),
});
export type BuildOpenPledgeRequest = z.infer<typeof buildOpenPledgeRequestSchema>;

export const buildCancelPledgeRequestSchema = z.object({ pledgeObjectId: objectId });
export type BuildCancelPledgeRequest = z.infer<typeof buildCancelPledgeRequestSchema>;

export const buildMakeOfferRequestSchema = z.object({
  pledgeObjectId: objectId,
  holdKey: z.string().min(1),
  coinObjectId: objectId,
  amountBaseUnits: baseUnits,
  aprBps: z.number().int().positive().max(65_535),
  expiresAtMs: z.number().int().positive(),
});
export type BuildMakeOfferRequest = z.infer<typeof buildMakeOfferRequestSchema>;

export const buildAcceptOfferRequestSchema = z.object({
  pledgeObjectId: objectId,
  holdObjectId: objectId,
  termMs: z.number().int().positive(),
});
export type BuildAcceptOfferRequest = z.infer<typeof buildAcceptOfferRequestSchema>;

export const buildRepayRequestSchema = z.object({
  pledgeObjectId: objectId,
  borrowerNoteObjectId: objectId,
  coinObjectId: objectId,
});
export type BuildRepayRequest = z.infer<typeof buildRepayRequestSchema>;

export const buildSettlePledgeRequestSchema = z.object({
  pledgeObjectId: objectId,
  lenderNoteObjectId: objectId,
});
export type BuildSettlePledgeRequest = z.infer<typeof buildSettlePledgeRequestSchema>;

export const buildRedeemRequestSchema = z.object({ receiptObjectId: objectId });
export type BuildRedeemRequest = z.infer<typeof buildRedeemRequestSchema>;

export const buildListPositionRequestSchema = z.object({
  lenderNoteObjectId: objectId,
  askBaseUnits: baseUnits,
});
export type BuildListPositionRequest = z.infer<typeof buildListPositionRequestSchema>;

export const buildBuyPositionRequestSchema = z.object({
  listingObjectId: objectId,
  coinObjectId: objectId,
  askBaseUnits: baseUnits,
});
export type BuildBuyPositionRequest = z.infer<typeof buildBuyPositionRequestSchema>;

export const buildDelistPositionRequestSchema = z.object({ listingObjectId: objectId });
export type BuildDelistPositionRequest = z.infer<typeof buildDelistPositionRequestSchema>;

/* The high-level action surface: the member names only what they can see, and
   the api resolves the coin, note, and receipt object ids over gRPC before it
   builds. The frontend can no longer read the chain to supply those itself. */
export const openPledgeActionSchema = z.object({
  receiptKey: z.string().min(1),
  /* The principal the borrower asks for, capped on chain at the item's ceiling
     (its appraised value scaled by the category loan-to-value). */
  requestedPrincipalBaseUnits: baseUnits,
  /* The most the borrower will pay; lenders compete by offering a lower rate. */
  requestedAprBps: z.number().int().nonnegative().max(65_535),
});
export type OpenPledgeAction = z.infer<typeof openPledgeActionSchema>;

export const makeOfferActionSchema = z.object({
  pledgeId: objectId,
  amountBaseUnits: baseUnits,
  /* The rate the lender offers to lend at, at or below the borrower's asked
     maximum; the loan is charged this rate, not the borrower's. */
  aprBps: z.number().int().positive().max(65_535),
  expiresAtMs: z.number().int().positive(),
});
export type MakeOfferAction = z.infer<typeof makeOfferActionSchema>;

export const acceptOfferActionSchema = z.object({
  pledgeId: objectId,
  holdObjectId: objectId,
  termMs: z.number().int().positive(),
});
export type AcceptOfferAction = z.infer<typeof acceptOfferActionSchema>;

export const pledgeActionSchema = z.object({ pledgeId: objectId });
export type PledgeAction = z.infer<typeof pledgeActionSchema>;

export const redeemActionSchema = z.object({ receiptKey: z.string().min(1) });
export type RedeemAction = z.infer<typeof redeemActionSchema>;

export const listPositionActionSchema = z.object({ pledgeId: objectId, askBaseUnits: baseUnits });
export type ListPositionAction = z.infer<typeof listPositionActionSchema>;

export const buyPositionActionSchema = z.object({
  listingObjectId: objectId,
  askBaseUnits: baseUnits,
});
export type BuyPositionAction = z.infer<typeof buyPositionActionSchema>;

export const delistPositionActionSchema = z.object({ listingObjectId: objectId });
export type DelistPositionAction = z.infer<typeof delistPositionActionSchema>;

/* Reclaim the hold behind an offer the market left behind. The api reads the
   pledge to tell an expired offer from a beaten one and refunds accordingly. */
export const reclaimHoldActionSchema = z.object({ holdObjectId: objectId, pledgeId: objectId });
export type ReclaimHoldAction = z.infer<typeof reclaimHoldActionSchema>;

/* The custodian issues a receipt on chain to a member's wallet. This is the one
   custodial step: a person confirms a physical item exists, appraises it, and
   takes custody, which no on-chain code can attest. Operator-signed, because
   the CustodianCap is the platform's; every later step is the member's own. */
/* An item photograph carried inline as a data url. Kept off chain: the receipt
   stores only the intake_hash that commits to the name and these images, and
   the api serves them back from its object store. */
const receiptImage = z
  .string()
  .max(8_000_000)
  .refine((value) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(value), {
    message: 'must be an image data url',
  });

export const issueVaultReceiptRequestSchema = z.object({
  holder: z.string().min(3),
  name: z.string().min(1).max(120),
  vault: z.string().min(1).max(64),
  appraisedValueBaseUnits: baseUnits,
  itemCategory: z.enum(['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART']),
  insuranceReference: z.string().max(120),
  mainImage: receiptImage,
  secondaryImages: z.array(receiptImage).max(2),
});
export type IssueVaultReceiptRequest = z.infer<typeof issueVaultReceiptRequestSchema>;

export const issueVaultReceiptResponseSchema = z.object({
  receiptObjectId: z.string(),
  receiptKey: z.string(),
  digest: z.string(),
});
export type IssueVaultReceiptResponse = z.infer<typeof issueVaultReceiptResponseSchema>;

/* The name and photographs behind a receipt, read back from the api's object
   store by the key the receipt carries on chain. Absent for a receipt issued
   before this record existed, which the reader falls back from gracefully. */
export const receiptMetadataResponseSchema = z.object({
  name: z.string(),
  mainImage: z.string(),
  secondaryImages: z.array(z.string()),
});
export type ReceiptMetadataResponse = z.infer<typeof receiptMetadataResponseSchema>;
