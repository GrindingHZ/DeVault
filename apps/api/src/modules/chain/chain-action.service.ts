import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import { GracePeriodActive } from '../../domain/lending/grace-period-active';
import { LoanNotActive } from '../../domain/lending/loan-not-active';
import { CannotOfferOnOwnListing } from '../../domain/marketplace/cannot-offer-on-own-listing';
import { HoldNotReclaimable } from '../../domain/marketplace/hold-not-reclaimable';
import { ListingAlreadyMatched } from '../../domain/marketplace/listing-already-matched';
import { ListingNotActive } from '../../domain/marketplace/listing-not-active';
import { NotResourceOwner } from '../../domain/marketplace/not-resource-owner';
import { OfferExpired } from '../../domain/marketplace/offer-expired';
import { OfferNotPending } from '../../domain/marketplace/offer-not-pending';
import { RateAboveMaximum } from '../../domain/marketplace/rate-above-maximum';
import type { DomainError } from '../../domain/shared/domain-error';
import { Instant } from '../../domain/shared/instant';
import type { SponsoredTransaction } from '../../infrastructure/chain/sponsored-transaction';
import { payoffCoverBaseUnits } from '../chain-read/wallet-figures';
import type { InterestTerms } from '../chain-read/wallet-figures';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { domainErrorStatusFor } from '../shared/http/domain-error-status';
import { ChainObjectResolver, pledgeStatuses } from './chain-object-resolver.service';
import type { HoldState, PledgeState } from './chain-object-resolver.service';
import { ChainTransactionService } from './chain-transaction.service';

function refuse(error: DomainError): never {
  throw new DomainErrorHttpException(error, domainErrorStatusFor(error.code));
}

/* The interest arithmetic is shared with the chain reads, which keep a
   timestamp as a number; the resolver keeps a u64 as a bigint. */
function loanTermsOf(pledge: PledgeState): InterestTerms {
  return {
    principalBaseUnits: pledge.principalBaseUnits,
    aprBps: pledge.aprBps,
    startedAtMs: Number(pledge.startedAtMs),
    maturesAtMs: Number(pledge.maturesAtMs),
  };
}

/* The member's actions, spelled in what they can see. Each resolves the object
   ids the build needs and then defers to the transaction service, so a member
   repays a loan by naming the loan alone and offering by naming the listing and
   an amount; the coin, note, and receipt are found for them.

   Each action also reads the pledge or hold it is about before building, and
   refuses with the code the screen can explain. The chain refuses the same
   things on its own; the read here is so a person acting on a view that fell
   behind (a listing taken down in another tab, an offer that lapsed, a loan
   already collected) hears why in words before a wallet is asked to sign. */
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
      requestedPrincipalBaseUnits: action.requestedPrincipalBaseUnits,
      requestedAprBps: action.requestedAprBps,
    });
  }

  /* Rule M4: lenders compete on the rate alone, so the offer funds exactly
     the principal the borrower asked for and lends at or below the rate they
     named. Rule M5, the item's ceiling, was enforced when the listing opened,
     so a principal read from the pledge is already inside it. */
  async makeOffer(member: string, action: MakeOfferAction): Promise<SponsoredTransaction> {
    const pledge = await this.openListing(action.pledgeId);
    if (pledge.borrower === member) {
      refuse(new CannotOfferOnOwnListing());
    }
    if (action.aprBps > pledge.requestedAprBps) {
      refuse(new RateAboveMaximum());
    }
    const amountBaseUnits = BigInt(action.amountBaseUnits);
    if (amountBaseUnits !== pledge.requestedPrincipalBaseUnits) {
      throw new BadRequestException(
        'An offer funds the principal the borrower asked for; only the rate is yours to set.',
      );
    }
    const coinObjectId = await this.resolver.coinForAmount(member, amountBaseUnits);
    return this.transactions.makeOffer(member, {
      pledgeObjectId: action.pledgeId,
      holdKey: randomUUID(),
      coinObjectId,
      amountBaseUnits: action.amountBaseUnits,
      aprBps: action.aprBps,
      expiresAtMs: action.expiresAtMs,
    });
  }

  async acceptOffer(member: string, action: AcceptOfferAction): Promise<SponsoredTransaction> {
    const pledge = await this.openListing(action.pledgeId);
    if (pledge.borrower !== member) {
      refuse(new NotResourceOwner());
    }
    const hold = await this.standingHold(action.holdObjectId, action.pledgeId);
    if (hold.expiresAtMs <= BigInt(Date.now())) {
      refuse(new OfferExpired());
    }
    return this.transactions.acceptOffer(member, {
      pledgeObjectId: action.pledgeId,
      holdObjectId: action.holdObjectId,
      termMs: action.termMs,
    });
  }

  async repay(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const pledge = await this.activeLoan(action.pledgeId);
    /* Past the grace cliff the contract refuses the payment; the loan is the
       lender's to claim, and to the borrower it is closed. */
    if (BigInt(Date.now()) >= pledge.maturesAtMs + pledge.gracePeriodMs) {
      refuse(new LoanNotActive());
    }
    const borrowerNoteObjectId = await this.resolver.borrowerNoteForPledge(member, action.pledgeId);
    /* The contract reprices the payoff at execution and returns what the coin
       carries beyond it, so the coin is split to cover the payoff for as long
       as a quote holds. Handing the whole coin in would settle the same way,
       but a wallet would preview the member's whole balance leaving. */
    const coverBaseUnits = payoffCoverBaseUnits(loanTermsOf(pledge), Date.now());
    const coinObjectId = await this.resolver.coinForAmount(member, coverBaseUnits);
    return this.transactions.repay(member, {
      pledgeObjectId: action.pledgeId,
      borrowerNoteObjectId,
      coinObjectId,
      amountBaseUnits: coverBaseUnits.toString(),
    });
  }

  async collect(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const pledge = await this.resolver.pledgeState(action.pledgeId);
    if (pledge === null || pledge.status !== pledgeStatuses.REPAID) {
      refuse(new LoanNotActive());
    }
    const lenderNoteObjectId = await this.resolver.lenderNoteForPledge(member, action.pledgeId);
    return this.transactions.collect(member, {
      pledgeObjectId: action.pledgeId,
      lenderNoteObjectId,
    });
  }

  async claim(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const pledge = await this.activeLoan(action.pledgeId);
    const graceEndsAtMs = pledge.maturesAtMs + pledge.gracePeriodMs;
    if (BigInt(Date.now()) < graceEndsAtMs) {
      refuse(new GracePeriodActive(Instant.fromEpochMilliseconds(graceEndsAtMs)));
    }
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

  /* Take an open listing off the market. The contract unwraps the receipt back
     to the borrower and refuses once an offer has been accepted, so a listing
     that has become a loan cannot be cancelled here; it is settled by repaying. */
  async cancelPledge(member: string, action: PledgeAction): Promise<SponsoredTransaction> {
    const pledge = await this.openListing(action.pledgeId);
    if (pledge.borrower !== member) {
      refuse(new NotResourceOwner());
    }
    return this.transactions.cancelPledge(member, { pledgeObjectId: action.pledgeId });
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

  /* A beaten offer, or one whose listing was taken down, reclaims against the
     pledge's own status; an offer that lapsed on an open listing reclaims on
     the clock alone. A hold still standing on an open listing is committed. */
  async reclaimHold(member: string, action: ReclaimHoldAction): Promise<SponsoredTransaction> {
    const hold = await this.resolver.holdState(action.holdObjectId);
    if (hold === null || hold.pledgeId !== action.pledgeId) {
      refuse(new HoldNotReclaimable());
    }
    const pledge = await this.resolver.pledgeState(action.pledgeId);
    if (pledge !== null && pledge.status !== pledgeStatuses.OPEN) {
      return this.transactions.reclaimLosing(member, {
        pledgeObjectId: action.pledgeId,
        holdObjectId: action.holdObjectId,
      });
    }
    if (hold.expiresAtMs > BigInt(Date.now())) {
      refuse(new HoldNotReclaimable());
    }
    return this.transactions.reclaimExpired(member, { holdObjectId: action.holdObjectId });
  }

  /* The listing an offer, an acceptance, or a cancellation is about. One that
     has become a loan was matched; one taken down, or never a pledge under
     this package, is no longer taking offers. */
  private async openListing(pledgeId: string): Promise<PledgeState> {
    const pledge = await this.resolver.pledgeState(pledgeId);
    if (pledge === null || pledge.status === pledgeStatuses.CANCELLED) {
      refuse(new ListingNotActive());
    }
    if (pledge.status !== pledgeStatuses.OPEN) {
      refuse(new ListingAlreadyMatched());
    }
    return pledge;
  }

  private async activeLoan(pledgeId: string): Promise<PledgeState> {
    const pledge = await this.resolver.pledgeState(pledgeId);
    if (pledge === null || pledge.status !== pledgeStatuses.ACTIVE) {
      refuse(new LoanNotActive());
    }
    return pledge;
  }

  private async standingHold(holdObjectId: string, pledgeId: string): Promise<HoldState> {
    const hold = await this.resolver.holdState(holdObjectId);
    if (hold === null || hold.pledgeId !== pledgeId) {
      refuse(new OfferNotPending());
    }
    return hold;
  }
}
