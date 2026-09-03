import { z } from 'zod';

export const roleSchema = z.enum(['MEMBER', 'VAULT_STAFF', 'OPERATIONS', 'COMPLIANCE']);

export type Role = z.infer<typeof roleSchema>;

export const registerRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(10).max(200),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const accountResponseSchema = z.object({
  id: z.string(),
  /* A password account's email, or null for an account that arrived by
     signing a wallet, which has an address instead. */
  email: z.email().nullable(),
  walletAddress: z.string().nullable(),
  roles: z.array(roleSchema),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

/* Signing in with a wallet: a nonce to sign, then the signature over it. */
export const walletChallengeRequestSchema = z.object({
  address: z.string().min(3),
});

export type WalletChallengeRequest = z.infer<typeof walletChallengeRequestSchema>;

export const walletChallengeResponseSchema = z.object({
  message: z.string(),
  expiresAt: z.string(),
});

export type WalletChallengeResponse = z.infer<typeof walletChallengeResponseSchema>;

export const walletVerifyRequestSchema = z.object({
  address: z.string().min(3),
  signature: z.string().min(1),
});

export type WalletVerifyRequest = z.infer<typeof walletVerifyRequestSchema>;
