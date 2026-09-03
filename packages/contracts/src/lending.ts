import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from './money';
import { settlementRefSchema } from './wallet';

export const loanStatusSchema = z.enum(['ACTIVE', 'REPAID', 'DEFAULTED', 'LIQUIDATED']);

export type LoanStatusDto = z.infer<typeof loanStatusSchema>;

export const loanRoleSchema = z.enum(['borrower', 'lender']);

export type LoanRole = z.infer<typeof loanRoleSchema>;

export const loanResponseSchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  /* What the loan is secured against, so a row can name the thing rather
     than only the receipt it lives on. */
  itemDescription: z.string(),
  /* Whether a photograph exists to fetch from `/receipts/{receiptId}/photo`.
     A person recognises their own things by sight long before they read a
     description. */
  hasPhotograph: z.boolean(),
  borrowerAccountId: z.string(),
  principal: moneySchema,
  annualPercentageRateBasisPoints: z.number().int(),
  startedAt: z.string(),
  maturesAt: z.string(),
  graceEndsAt: z.string(),
  lenderNoteHolderAccountId: z.string(),
  /* Names the claim itself, so a lender can act on it: selling a position
     sells this note (docs/superpowers/specs/2026-08-24-secondary-market-design.md). */
  lenderNoteId: z.string(),
  status: loanStatusSchema,
  /* What this loan has earned so far, computed against the server's clock.

     It cannot be worked out in the browser: a demo process runs its clock
     weeks ahead (docs/10-flows.md flow 15), so the same arithmetic there
     would answer a plausible figure that is not the one anybody is charged.

     Named for what it is. A list figure is not a quote: repayment still
     fetches one from the payoff endpoint, which carries a validUntil and
     refuses a stale one. */
  accruedInterest: moneySchema,
  originationSettlementRef: settlementRefSchema,
});

export type LoanResponse = z.infer<typeof loanResponseSchema>;

export const myLoansResponseSchema = z.object({
  items: z.array(loanResponseSchema),
  /* The server's clock at the moment it answered. Anything the screen works
     out about time comes from here rather than from the browser: how far
     through its term a loan is, how many days are left, whether it has
     matured. A demo process runs weeks ahead (docs/10-flows.md flow 15), so
     a progress bar drawn against `Date.now()` would say a matured loan was
     three percent through and be believed. */
  asOf: z.iso.datetime(),
});

export type MyLoansResponse = z.infer<typeof myLoansResponseSchema>;

export const payoffQuoteResponseSchema = z.object({
  loanId: z.string(),
  principal: moneySchema,
  accruedInterest: moneySchema,
  total: moneySchema,
  quotedAt: z.string(),
  validUntil: z.string(),
});

export type PayoffQuoteResponse = z.infer<typeof payoffQuoteResponseSchema>;

/* The quote travels back with the payment so the server can tell a stale
   figure from a current one (docs/04-api-contract.md). */
export const repayLoanRequestSchema = z.object({
  amount: positiveMoneySchema,
  quotedAt: z.iso.datetime(),
});

export type RepayLoanRequest = z.infer<typeof repayLoanRequestSchema>;

export const repaymentResponseSchema = z.object({
  loan: loanResponseSchema,
  principal: moneySchema,
  accruedInterest: moneySchema,
  total: moneySchema,
  paidToAccountId: z.string(),
});

export type RepaymentResponse = z.infer<typeof repaymentResponseSchema>;
