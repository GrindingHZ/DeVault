import { Body, Controller, Post } from '@nestjs/common';
import {
  acceptOfferActionSchema,
  buyPositionActionSchema,
  delistPositionActionSchema,
  listPositionActionSchema,
  makeOfferActionSchema,
  openPledgeActionSchema,
  pledgeActionSchema,
  reclaimHoldActionSchema,
  redeemActionSchema,
} from '@depawn/contracts';
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
  SponsoredTransactionResponse,
} from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { ChainActionService } from './chain-action.service';
import { WalletNotLinked } from './wallet-not-linked.error';

function walletOf(account: Account): string {
  if (account.walletAddress === null) {
    throw new DomainErrorHttpException(new WalletNotLinked(), 409);
  }
  return account.walletAddress;
}

/* The member's high-level actions. Each returns the unsigned bytes of a
   sponsored transaction; the member's wallet signs them and posts the signature
   to /chain/execute. The object ids are resolved for the member, so the request
   names only what a person can see on a screen. */
@Controller('chain/actions')
export class ChainActionController {
  constructor(private readonly actions: ChainActionService) {}

  @Post('open-pledge')
  openPledge(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(openPledgeActionSchema)) body: OpenPledgeAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.openPledge(walletOf(account), body);
  }

  @Post('make-offer')
  makeOffer(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(makeOfferActionSchema)) body: MakeOfferAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.makeOffer(walletOf(account), body);
  }

  @Post('accept-offer')
  acceptOffer(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(acceptOfferActionSchema)) body: AcceptOfferAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.acceptOffer(walletOf(account), body);
  }

  @Post('repay')
  repay(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(pledgeActionSchema)) body: PledgeAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.repay(walletOf(account), body);
  }

  @Post('collect')
  collect(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(pledgeActionSchema)) body: PledgeAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.collect(walletOf(account), body);
  }

  @Post('claim')
  claim(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(pledgeActionSchema)) body: PledgeAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.claim(walletOf(account), body);
  }

  @Post('redeem')
  redeem(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(redeemActionSchema)) body: RedeemAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.redeem(walletOf(account), body);
  }

  @Post('list-position')
  listPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(listPositionActionSchema)) body: ListPositionAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.listPosition(walletOf(account), body);
  }

  @Post('buy-position')
  buyPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buyPositionActionSchema)) body: BuyPositionAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.buyPosition(walletOf(account), body);
  }

  @Post('delist-position')
  delistPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(delistPositionActionSchema)) body: DelistPositionAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.delistPosition(walletOf(account), body);
  }

  @Post('reclaim-hold')
  reclaimHold(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(reclaimHoldActionSchema)) body: ReclaimHoldAction,
  ): Promise<SponsoredTransactionResponse> {
    return this.actions.reclaimHold(walletOf(account), body);
  }
}
