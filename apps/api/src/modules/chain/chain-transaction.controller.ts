import { Body, Controller, Post } from '@nestjs/common';
import {
  buildAcceptOfferRequestSchema,
  buildBuyPositionRequestSchema,
  buildCancelPledgeRequestSchema,
  buildDelistPositionRequestSchema,
  buildListPositionRequestSchema,
  buildMakeOfferRequestSchema,
  buildOpenPledgeRequestSchema,
  buildRedeemRequestSchema,
  buildRepayRequestSchema,
  buildSettlePledgeRequestSchema,
  executeChainActionRequestSchema,
} from '@depawn/contracts';
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
  ChainExecutionResponse,
  ExecuteChainActionRequest,
  SponsoredTransactionResponse,
  UsdcFaucetResponse,
} from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { ChainTransactionService } from './chain-transaction.service';
import { UsdcFaucetService } from './usdc-faucet.service';
import { WalletNotLinked } from './wallet-not-linked.error';

/* The self-custody write surface. A build endpoint answers the bytes for the
   member's wallet to sign; the execute endpoint takes the signature back,
   adds the sponsor's, and submits. Every build is signed by the member whose
   linked wallet the session names. */
@Controller('chain')
export class ChainTransactionController {
  constructor(
    private readonly transactions: ChainTransactionService,
    private readonly faucet: UsdcFaucetService,
  ) {}

  @Post('faucet')
  requestUsdc(@CurrentAccount() account: Account): Promise<UsdcFaucetResponse> {
    return this.faucet.grantTo(walletOf(account));
  }

  @Post('pledges/build')
  openPledge(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildOpenPledgeRequestSchema)) body: BuildOpenPledgeRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.openPledge(walletOf(account), body);
  }

  @Post('pledges/cancel/build')
  cancelPledge(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildCancelPledgeRequestSchema)) body: BuildCancelPledgeRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.cancelPledge(walletOf(account), body);
  }

  @Post('offers/build')
  makeOffer(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildMakeOfferRequestSchema)) body: BuildMakeOfferRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.makeOffer(walletOf(account), body);
  }

  @Post('offers/accept/build')
  acceptOffer(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildAcceptOfferRequestSchema)) body: BuildAcceptOfferRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.acceptOffer(walletOf(account), body);
  }

  @Post('loans/repay/build')
  repay(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildRepayRequestSchema)) body: BuildRepayRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.repay(walletOf(account), body);
  }

  @Post('loans/collect/build')
  collect(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildSettlePledgeRequestSchema)) body: BuildSettlePledgeRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.collect(walletOf(account), body);
  }

  @Post('loans/claim/build')
  claimDefault(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildSettlePledgeRequestSchema)) body: BuildSettlePledgeRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.claimDefault(walletOf(account), body);
  }

  @Post('receipts/redeem/build')
  redeem(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildRedeemRequestSchema)) body: BuildRedeemRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.redeem(walletOf(account), body);
  }

  @Post('positions/build')
  listPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildListPositionRequestSchema)) body: BuildListPositionRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.listPosition(walletOf(account), body);
  }

  @Post('positions/buy/build')
  buyPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildBuyPositionRequestSchema)) body: BuildBuyPositionRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.buyPosition(walletOf(account), body);
  }

  @Post('positions/delist/build')
  delistPosition(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(buildDelistPositionRequestSchema)) body: BuildDelistPositionRequest,
  ): Promise<SponsoredTransactionResponse> {
    return this.transactions.delistPosition(walletOf(account), body);
  }

  @Post('execute')
  async execute(
    @Body(new ZodValidationPipe(executeChainActionRequestSchema)) body: ExecuteChainActionRequest,
  ): Promise<ChainExecutionResponse> {
    const execution = await this.transactions.execute(body.transactionBytes, body.signature);
    return {
      digest: execution.digest,
      createdObjectIds: [...execution.createdObjectIds],
      events: execution.events.map((event) => event.name),
    };
  }
}

function walletOf(account: Account): string {
  if (account.walletAddress === null) {
    throw new DomainErrorHttpException(new WalletNotLinked(), 409);
  }
  return account.walletAddress;
}
