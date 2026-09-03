import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ChainExecutionResponse, SponsoredTransactionResponse } from '@depawn/contracts';
import { useSponsoredWrite } from './use-sponsored-write';

/* A member action as a mutation: build the sponsored transaction from the
   input, have the wallet sign it, and submit. Every write button on the restored
   ui hangs off one of these, so the two-step signing lives in one place and each
   call site stays a plain mutation with its own onSuccess. */
export function useChainAction<TInput>(
  build: (input: TInput) => Promise<SponsoredTransactionResponse>,
  options: { readonly onSuccess?: () => void | Promise<void> } = {},
): UseMutationResult<ChainExecutionResponse, Error, TInput> {
  const sign = useSponsoredWrite();
  return useMutation({
    mutationFn: (input: TInput) => sign(() => build(input)),
    ...(options.onSuccess === undefined ? {} : { onSuccess: options.onSuccess }),
  });
}
