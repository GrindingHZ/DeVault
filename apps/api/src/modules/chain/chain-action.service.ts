import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { maxLendBaseUnits } from '../../config/loan-to-value';
import type {
  AcceptOfferAction,
  BuyPositionAction,
  DelistPositionAction,
  ListPositionAction,
  MakeOfferAction,
  OpenPledgeAction,
  PledgeAction,
  ReclaimHoldAction,
  RedeemAction,
} from '@depawn/contracts';
import type { SponsoredTransaction } from '../../infrastructure/chain/sponsored-transaction';
import { ChainObjectResolver } from './chain-object-resolver.service';
import { ChainTransactionService } from './chain-transaction.service';

/* The member's actions, spelled in what they can see. Each resolves the object
   ids the build needs and then defers to the transaction service, so a member
   repays a loan by naming the loan alone and offering by naming the listing and
   an amount; the coin, note, and receipt are found for them. */
@Injectable()
export class ChainActionService {
  constructor(
    private readonly resolver: ChainObjectResolver,
    private readonly transactions: ChainTransactionService,
  ) {}

  async openPledge(member: string, action: OpenPledgeAction): Promise<SponsoredTransaction> {
    const receiptObjectId = await this.resolver.receiptForKey(member, action.receiptKey);
    return this.transactions.openPledge(member, {
      receiptObjectId,
      requestedAprBps: action.requestedAprBps,
    });
  }

  async makeOffer(member: string, action: MakeOfferAction): Promise<SponsoredTransaction> {
    const amountBaseUnits = BigInt(action.amountBaseUnits);
    /* Rule M5: an offer may not lend above the item's ceiling, its appraised
       value scaled by the category's loan-to-value. The contract does not know
       the appraisal in base units, so the ceiling is held here, at the last
       point before the money is committed. A pledge whose appraisal cannot be
       read answers zero, which is treated as no ceiling rather than a refusal. */
    const appraisal = await this.resolver.pledgeAppraisal(action.pledgeId);
    const ceiling = maxLendBaseUnits(appraisal.appraisedValueBaseUnits, appraisal.category);
    if (ceiling > 0n && amountBaseUnits > ceiling) {
      throw new BadRequestException('This offer is above the lending ceiling for this item.');
    }
    const coinObjectId = await this.resolver.coinForAmount(member, amountBaseUnits);
    return this.transactions.makeOffer(member, {
      pledgeObjectId: action.pledgeId,
      holdKey: randomUUID(),
      coinObjectId,
      amountBaseUnits: action.amountBaseUnits,
      expiresAtMs: action.expiresAtMs,
    });
  }

  acceptOffer(member: string, action: AcceptOfferAction): Promise<SponsoredTransaction> {
    return this.transactions.acceptOffer(member, {
      pledgeObjectId: action.pledgeId,
      holdObjectId: action.holdObjectId,
      termMs: action.termMs,
    });
  }

  async repay(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const borrowerNoteObjectId = await this.resolver.borrowerNoteForPledge(member, action.pledgeId);
    /* Repay hands the whole coin in and takes back the change, so the largest
       coin is chosen rather than one split to the payoff. */
    const coinObjectId = await this.resolver.coinForAmount(member, 0n);
    return this.transactions.repay(member, {
      pledgeObjectId: action.pledgeId,
      borrowerNoteObjectId,
      coinObjectId,
    });
  }

  async collect(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const lenderNoteObjectId = await this.resolver.lenderNoteForPledge(member, action.pledgeId);
    return this.transactions.collect(member, { pledgeObjectId: action.pledgeId, lenderNoteObjectId });
  }

  async claim(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const lenderNoteObjectId = await this.resolver.lenderNoteForPledge(member, action.pledgeId);
    return this.transactions.claimDefault(member, {
      pledgeObjectId: action.pledgeId,
      lenderNoteObjectId,
    });
  }

  async redeem(member: string, action: RedeemAction): Promise<SponsoredTransaction> {
    const receiptObjectId = await this.resolver.receiptForKey(member, action.receiptKey);
    return this.transactions.redeem(member, { receiptObjectId });
  }

  async listPosition(member: string, action: ListPositionAction): Promise<SponsoredTransaction> {
    const lenderNoteObjectId = await this.resolver.lenderNoteForPledge(member, action.pledgeId);
    return this.transactions.listPosition(member, {
      lenderNoteObjectId,
      askBaseUnits: action.askBaseUnits,
    });
  }

  async buyPosition(member: string, action: BuyPositionAction): Promise<SponsoredTransaction> {
    const coinObjectId = await this.resolver.coinForAmount(member, BigInt(action.askBaseUnits));
    return this.transactions.buyPosition(member, {
      listingObjectId: action.listingObjectId,
      coinObjectId,
      askBaseUnits: action.askBaseUnits,
    });
  }

  delistPosition(member: string, action: DelistPositionAction): Promise<SponsoredTransaction> {
    return this.transactions.delistPosition(member, { listingObjectId: action.listingObjectId });
  }

  async reclaimHold(member: string, action: ReclaimHoldAction): Promise<SponsoredTransaction> {
    const acceptance = await this.resolver.pledgeAcceptance(action.pledgeId);
    /* A beaten offer reclaims by proving the pledge matched another hold; an
       offer whose own date passed reclaims on the clock alone. */
    return acceptance.matched
      ? this.transactions.reclaimLosing(member, {
          holdObjectId: action.holdObjectId,
          acceptedHoldKey: acceptance.acceptedHoldKey,
        })
      : this.transactions.reclaimExpired(member, { holdObjectId: action.holdObjectId });
  }
}
