import { useSignTransaction } from '@mysten/dapp-kit';
import type { ChainExecutionResponse, SponsoredTransactionResponse } from '@depawn/contracts';
import { executeChainAction } from '@depawn/contracts';

/* The member's half of a sponsored write. The api builds a transaction with the
   sponsor as gas owner and hands back its bytes; the wallet signs exactly those
   bytes, adding nothing; the api takes the signature, sponsor-signs the same
   bytes, and submits.

   The wallet must sign the api's bytes unchanged, or the sponsor's signature
   ends up over a different transaction and the submit is rejected. dapp-kit's
   handling of a pre-built sponsored transaction is the one part of this that a
   real wallet has to confirm; everything either side of the signature is
   settled. */
export function useSponsoredWrite(): (
  build: () => Promise<SponsoredTransactionResponse>,
) => Promise<ChainExecutionResponse> {
  const { mutateAsync: signTransaction } = useSignTransaction();

  return async function run(build) {
    const { transactionBytes } = await build();
    const signed = await signTransaction({ transaction: transactionBytes });
    /* Post the bytes the wallet actually signed, so the signature and the
       sponsor's cover the same transaction. */
    return executeChainAction({ transactionBytes: signed.bytes, signature: signed.signature });
  };
}
