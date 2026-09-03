import type { Transaction } from '@mysten/sui/transactions';
import type { ChainExecution } from './chain-execution';

/* A transaction built for a member to sign, with the platform named as the
   gas owner. The api builds and hands out the bytes; the member's wallet
   signs them; the api sponsor signs and submits. The member needs no SUI,
   only the coin the action moves. */
export interface SponsoredTransaction {
  readonly transactionBytes: string;
}

export interface SponsoredTransactionGateway {
  /* Builds `append`'s commands into a transaction sent by `memberAddress` and
     paid by the sponsor, and answers the bytes for the member to sign. */
  build(
    memberAddress: string,
    append: (transaction: Transaction) => void,
  ): Promise<SponsoredTransaction>;

  /* Sponsor signs the same bytes and submits with both signatures. */
  execute(transactionBytes: string, memberSignature: string): Promise<ChainExecution>;
}

export const SPONSORED_TRANSACTION_GATEWAY = Symbol('SPONSORED_TRANSACTION_GATEWAY');
