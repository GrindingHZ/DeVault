import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from './money';

export const liquidationStatusSchema = z.enum(['SCHEDULED', 'BIDDING', 'SETTLED', 'CANCELLED']);

export type LiquidationStatusDto = z.infer<typeof liquidationStatusSchema>;

export const bidResponseSchema = z.object({
  id: z.string(),
  bidderAccountId: z.string(),
  amount: moneySchema,
  placedAt: z.string(),
});

export type BidResponse = z.infer<typeof bidResponseSchema>;

export const liquidationResponseSchema = z.object({
  id: z.string(),
  loanId: z.string(),
  receiptId: z.string(),
  reservePrice: moneySchema,
  status: liquidationStatusSchema,
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  winningBidId: z.string().nullable(),
  highestBid: moneySchema.nullable(),
  bids: z.array(bidResponseSchema),
});

export type LiquidationResponse = z.infer<typeof liquidationResponseSchema>;

export const liquidationListResponseSchema = z.object({
  items: z.array(liquidationResponseSchema),
});

export type LiquidationListResponse = z.infer<typeof liquidationListResponseSchema>;

export const scheduleLiquidationRequestSchema = z.object({
  reservePrice: positiveMoneySchema,
});

export type ScheduleLiquidationRequest = z.infer<typeof scheduleLiquidationRequestSchema>;

export const openLiquidationRequestSchema = z.object({
  biddingWindowMs: z.number().int().positive(),
});

export type OpenLiquidationRequest = z.infer<typeof openLiquidationRequestSchema>;

/* Why the sale was called off, recorded on the audit entry. Required rather
   than optional: cancelling reverses an operations judgement, and an entry
   that cannot say why is the one somebody needs six months later. */
export const cancelLiquidationRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type CancelLiquidationRequest = z.infer<typeof cancelLiquidationRequestSchema>;

export const placeBidRequestSchema = z.object({
  amount: positiveMoneySchema,
});

export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;

/* A bidder's own bids. Bidding commits money the same way offering does, and
   a beaten bid stays committed until its owner pulls it back, so this exists
   for the same reason the offers list does: money nobody can see is money
   nobody reclaims. */
export const myBidResponseSchema = z.object({
  id: z.string(),
  liquidationId: z.string(),
  itemDescription: z.string(),
  receiptId: z.string(),
  hasPhotograph: z.boolean(),
  amount: moneySchema,
  placedAt: z.iso.datetime(),
  liquidationStatus: liquidationStatusSchema,
  closesAt: z.iso.datetime().nullable(),
  /* Whether this bid leads the book, or won it once the sale has settled. */
  isStanding: z.boolean(),
  /* Whether the money behind it is still committed. A beaten bid keeps its
     row after the refund, so the row alone cannot say. */
  isHoldHeld: z.boolean(),
});

export type MyBidResponse = z.infer<typeof myBidResponseSchema>;

export const myBidsResponseSchema = z.object({
  items: z.array(myBidResponseSchema),
  asOf: z.iso.datetime(),
});

export type MyBidsResponse = z.infer<typeof myBidsResponseSchema>;
