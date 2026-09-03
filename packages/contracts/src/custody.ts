import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from './money';

export const itemCategorySchema = z.enum(['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART']);

export type ItemCategoryDto = z.infer<typeof itemCategorySchema>;

/* The order a person reads them in, most liquid first, which is also the
   order the loan to value caps run. */
export const itemCategories = itemCategorySchema.options;

export const intakeStatusSchema = z.enum(['DRAFT', 'SEALED']);

export const receiptStatusSchema = z.enum(['IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED']);

export const evidenceItemSchema = z.object({
  label: z.string().min(1),
  contentHash: z.string().min(1),
  /* Determined from the bytes at upload, not from what the uploader claimed.
     Optional because evidence written before photographs were verified has
     no recorded type. */
  contentType: z.string().min(1).optional(),
  byteLength: z.number().int().nonnegative().optional(),
});

export type EvidenceItemDto = z.infer<typeof evidenceItemSchema>;

export const beginIntakeRequestSchema = z.object({
  borrowerEmail: z.email().max(320),
  itemCategory: itemCategorySchema,
  itemDescription: z.string().min(1).max(2000),
});

export type BeginIntakeRequest = z.infer<typeof beginIntakeRequestSchema>;

export const patchIntakeRequestSchema = z.object({
  itemDescription: z.string().min(1).max(2000).optional(),
  serialNumbers: z.array(z.string().min(1)).max(50).optional(),
  sealNumber: z.string().min(1).max(100).optional(),
});

export type PatchIntakeRequest = z.infer<typeof patchIntakeRequestSchema>;

export const recordAppraisalRequestSchema = z.object({
  value: positiveMoneySchema,
  method: z.string().min(1).max(500),
  comparableReferences: z.string().max(2000),
});

export type RecordAppraisalRequest = z.infer<typeof recordAppraisalRequestSchema>;

export const appraisalResponseSchema = z.object({
  id: z.string(),
  appraiserId: z.string(),
  value: moneySchema,
  method: z.string(),
  comparableReferences: z.string(),
  appraisedAt: z.string(),
});

export type AppraisalResponse = z.infer<typeof appraisalResponseSchema>;

export const intakeResponseSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  borrowerAccountId: z.string(),
  itemCategory: itemCategorySchema,
  itemDescription: z.string(),
  serialNumbers: z.array(z.string()),
  sealNumber: z.string().nullable(),
  evidence: z.array(evidenceItemSchema),
  status: intakeStatusSchema,
  sealedHash: z.string().nullable(),
  appraisals: z.array(appraisalResponseSchema),
});

export type IntakeResponse = z.infer<typeof intakeResponseSchema>;

export const issueReceiptRequestSchema = z.object({
  insurancePolicyReference: z.string().min(1).max(200),
});

export type IssueReceiptRequest = z.infer<typeof issueReceiptRequestSchema>;

export const receiptResponseSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  holderAccountId: z.string(),
  /* Who holds it, in words. Staff at a counter need to know whose item this
     is, and an account identifier does not tell them. Null on the screens
     where the holder is the reader and naming them would be noise. */
  holderLabel: z.string().nullable(),
  intakeRecordHash: z.string(),
  appraisedValue: moneySchema,
  appraisedAt: z.string(),
  itemCategory: itemCategorySchema,
  itemDescription: z.string(),
  /* What tells this one apart from another of the same model. Empty for
     an item nobody recorded a serial against, which is most art. */
  serialNumbers: z.array(z.string()),
  /* Whether a photograph can be fetched from
     `/receipts/{id}/photo`. The bytes have their own authorisation; this only
     says whether asking is worthwhile. */
  hasPhotograph: z.boolean(),
  insurancePolicyReference: z.string(),
  status: receiptStatusSchema,
  encumberedByLoanId: z.string().nullable(),
  /* The lending ceiling for this item's category, in basis points of its
     appraised value. The borrower cannot ask for more than this against it, and
     the list screen shows and caps to it. The authority is the protocol
     parameters the contract enforces at open; this carries the real number so
     the screen need not hold its own copy. */
  categoryMaxLoanToValueBasisPoints: z.number().int().nonnegative(),
  /* The object that holds this item on chain: the receipt itself while it is
     loose in the wallet, the pledge that wraps it while it is listed or on
     loan. A link to the explorer, so the record is provable, not just shown.
     Null on a receipt the chain does not know. */
  chainObjectId: z.string().nullable(),
});

export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

export const receiptListResponseSchema = z.object({
  items: z.array(receiptResponseSchema),
});

export type ReceiptListResponse = z.infer<typeof receiptListResponseSchema>;

export const vaultExposureResponseSchema = z.object({
  vaultId: z.string(),
  insuredLimit: moneySchema,
  exposure: moneySchema,
  remaining: moneySchema,
});

export type VaultExposureResponse = z.infer<typeof vaultExposureResponseSchema>;
