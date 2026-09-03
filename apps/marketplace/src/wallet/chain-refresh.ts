import type { QueryClient } from '@tanstack/react-query';

/* Every query that is read from the chain, by key prefix. A write can change
   any of them, and a screen that lists the ones it thinks it touched is a
   screen that will one day miss one. */
const chainReadPrefixes: readonly (readonly string[])[] = [
  ['listings'],
  ['offers'],
  ['bids'],
  ['receipts'],
  ['loans'],
  ['redemption-requests'],
  ['note-sales'],
  ['market'],
  ['wallet'],
  ['chain', 'wallet'],
  ['chain', 'activity'],
];

/* The full node answers a write before its indexer has caught up: the
   transaction is final, but the owned objects and events the reads depend on
   can trail it by a checkpoint or two. One refetch fired the moment the write
   returns can therefore still read the world from before it, and the screen
   sits on the old state until somebody reloads. So the reads are refreshed
   now, and again twice more as the indexer settles. */
const settleDelaysMs: readonly number[] = [2_500, 7_000];

export async function refreshChainReads(queryClient: QueryClient): Promise<void> {
  const refresh = (): Promise<unknown> =>
    Promise.all(chainReadPrefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  await refresh();
  for (const delayMs of settleDelaysMs) {
    window.setTimeout(() => {
      void refresh();
    }, delayMs);
  }
}
