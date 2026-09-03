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

export const buildOpenPledgeRequestSchema = z.object({
  receiptObjectId: objectId,
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
