import { Inject, Injectable } from '@nestjs/common';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type {
  BuildAcceptOfferRequest,
  BuildBuyPositionRequest,
  BuildCancelPledgeRequest,
  BuildDelistPositionRequest,
  BuildListPositionRequest,
  BuildMakeOfferRequest,
  BuildOpenPledgeRequest,
  BuildRedeemRequest,
  BuildRepayRequest,
  BuildSettlePledgeRequest,
} from '@depawn/contracts';
import type { ChainExecution } from '../../infrastructure/chain/chain-execution';
import { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';
import { appendRedeem } from '../../infrastructure/chain/ptb/custody-calls';
import {
  appendBuyPosition,
  appendDelistPosition,
  appendListPosition,
} from '../../infrastructure/chain/ptb/market-calls';
import {
  appendMakeOffer,
  appendRefundExpired,
  appendRefundLosing,
} from '../../infrastructure/chain/ptb/offer-calls';
import {
  appendAcceptOffer,
  appendCancelPledge,
  appendClaimDefault,
  appendCollect,
  appendOpenPledge,
  appendRepay,
} from '../../infrastructure/chain/ptb/pledge-calls';
import { SPONSORED_TRANSACTION_GATEWAY } from '../../infrastructure/chain/sponsored-transaction';
import type {
  SponsoredTransaction,
  SponsoredTransactionGateway,
} from '../../infrastructure/chain/sponsored-transaction';

/* Turns a member's request into a transaction they will sign. Each method is
   one programmable transaction: it appends the builder's commands against the
   active deployment, and the gateway sets the member as sender and the
   platform as gas owner. A coin an offer or a purchase locks is split to the
   exact amount here, so the member keeps the remainder of the coin. */
@Injectable()
export class ChainTransactionService {
  constructor(
    private readonly deployments: ChainDeploymentRegistry,
    @Inject(SPONSORED_TRANSACTION_GATEWAY)
    private readonly gateway: SponsoredTransactionGateway,
  ) {}

  openPledge(member: string, request: BuildOpenPledgeRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendOpenPledge(transaction, deployment, {
        receiptObjectId: request.receiptObjectId,
        requestedAprBps: request.requestedAprBps,
      }),
    );
  }

  cancelPledge(member: string, request: BuildCancelPledgeRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendCancelPledge(transaction, deployment, { pledgeObjectId: request.pledgeObjectId }),
    );
  }

  makeOffer(member: string, request: BuildMakeOfferRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) => {
      const payment = splitExact(transaction, request.coinObjectId, request.amountBaseUnits);
      appendMakeOffer(transaction, deployment, {
        pledgeObjectId: request.pledgeObjectId,
        holdKey: request.holdKey,
        payment,
        expiresAtMs: BigInt(request.expiresAtMs),
      });
    });
  }

  acceptOffer(member: string, request: BuildAcceptOfferRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendAcceptOffer(transaction, deployment, {
        pledgeObjectId: request.pledgeObjectId,
        holdObjectId: request.holdObjectId,
        termMs: BigInt(request.termMs),
      }),
    );
  }

  repay(member: string, request: BuildRepayRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendRepay(transaction, deployment, {
        pledgeObjectId: request.pledgeObjectId,
        borrowerNoteObjectId: request.borrowerNoteObjectId,
        payment: transaction.object(request.coinObjectId),
      }),
    );
  }

  collect(member: string, request: BuildSettlePledgeRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendCollect(transaction, deployment, {
        pledgeObjectId: request.pledgeObjectId,
        lenderNoteObjectId: request.lenderNoteObjectId,
      }),
    );
  }

  claimDefault(member: string, request: BuildSettlePledgeRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendClaimDefault(transaction, deployment, {
        pledgeObjectId: request.pledgeObjectId,
        lenderNoteObjectId: request.lenderNoteObjectId,
      }),
    );
  }

  redeem(member: string, request: BuildRedeemRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendRedeem(transaction, deployment, { receiptObjectId: request.receiptObjectId }),
    );
  }

  listPosition(member: string, request: BuildListPositionRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendListPosition(transaction, deployment, {
        lenderNoteObjectId: request.lenderNoteObjectId,
        askBaseUnits: BigInt(request.askBaseUnits),
      }),
    );
  }

  buyPosition(member: string, request: BuildBuyPositionRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) => {
      const payment = splitExact(transaction, request.coinObjectId, request.askBaseUnits);
      appendBuyPosition(transaction, deployment, {
        listingObjectId: request.listingObjectId,
        payment,
      });
    });
  }

  delistPosition(member: string, request: BuildDelistPositionRequest): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendDelistPosition(transaction, deployment, { listingObjectId: request.listingObjectId }),
    );
  }

  reclaimExpired(member: string, request: { holdObjectId: string }): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendRefundExpired(transaction, deployment, { holdObjectId: request.holdObjectId }),
    );
  }

  reclaimLosing(
    member: string,
    request: { holdObjectId: string; acceptedHoldKey: string },
  ): Promise<SponsoredTransaction> {
    const deployment = this.deployments.current();
    return this.gateway.build(member, (transaction) =>
      appendRefundLosing(transaction, deployment, {
        holdObjectId: request.holdObjectId,
        pledgeMatched: true,
        acceptedHoldKey: request.acceptedHoldKey,
      }),
    );
  }

  execute(transactionBytes: string, signature: string): Promise<ChainExecution> {
    return this.gateway.execute(transactionBytes, signature);
  }
}

function splitExact(
  transaction: Transaction,
  coinObjectId: string,
  amountBaseUnits: string,
): TransactionObjectArgument {
  const [coin] = transaction.splitCoins(transaction.object(coinObjectId), [BigInt(amountBaseUnits)]);
  return coin;
}
