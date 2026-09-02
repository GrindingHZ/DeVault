import { z } from 'zod';
import { itemCategorySchema } from './custody';
import { moneySchema } from './money';

export const noteSaleStatusSchema = z.enum(['OPEN', 'SOLD', 'WITHDRAWN', 'VOIDED']);

export type NoteSaleStatusDto = z.infer<typeof noteSaleStatusSchema>;

/* One row of the secondary market. Every figure the value chart draws is
   priced by the server; the client only formats and plots. */
export const noteSaleSummarySchema = z.object({
  id: z.string(),
  loanId: z.string(),
  lenderNoteId: z.string(),
  sellerAccountId: z.string(),
  status: noteSaleStatusSchema,
  askPrice: moneySchema,
  createdAt: z.iso.datetime(),
  itemDescription: z.string(),
  itemCategory: itemCategorySchema,
  principal: moneySchema,
  annualPercentageRateBasisPoints: z.number().int(),
  startedAt: z.iso.datetime(),
  maturesAt: z.iso.datetime(),
  accruedInterest: moneySchema,
  currentValue: moneySchema,
  maturityValue: moneySchema,
});

export type NoteSaleSummary = z.infer<typeof noteSaleSummarySchema>;

export const browseNoteSalesResponseSchema = z.object({
  items: z.array(noteSaleSummarySchema),
  /* The server's clock at the moment it answered, the same convention as the
     loans response: time on screen comes from here, never from the browser. */
  asOf: z.iso.datetime(),
});

export type BrowseNoteSalesResponse = z.infer<typeof browseNoteSalesResponseSchema>;

export const myNoteSalesResponseSchema = z.object({
  items: z.array(noteSaleSummarySchema),
  asOf: z.iso.datetime(),
});

export type MyNoteSalesResponse = z.infer<typeof myNoteSalesResponseSchema>;

export const listNoteForSaleRequestSchema = z.object({
  askPrice: moneySchema,
});

export type ListNoteForSaleRequest = z.infer<typeof listNoteForSaleRequestSchema>;

export const noteSaleActionResponseSchema = z.object({
  sale: noteSaleSummarySchema,
});

export type NoteSaleActionResponse = z.infer<typeof noteSaleActionResponseSchema>;
