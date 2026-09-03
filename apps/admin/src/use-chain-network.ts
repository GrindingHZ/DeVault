import { fetchHealth } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import type { SettlementNetwork } from '@depawn/ui';

/* Which chain the api settles on, so a settlement digest links to the right
   explorer. Null on the ledger drivers. */
export function useChainNetwork(): SettlementNetwork | null {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return health.data?.chain?.network ?? null;
}
