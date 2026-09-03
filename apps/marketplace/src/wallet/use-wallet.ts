import { fetchWallet } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { WalletResponse } from '@depawn/contracts';

/* The member's money, computed by the api from the chain. The browser cannot
   read a full node directly any more, so there is one call rather than a fan of
   object reads (docs/superpowers/specs/2026-08-26-wallet-self-custody-design.md). */
export const walletQueryKey = ['wallet'] as const;

export function useWallet(): UseQueryResult<WalletResponse> {
  return useQuery({ queryKey: walletQueryKey, queryFn: fetchWallet });
}
