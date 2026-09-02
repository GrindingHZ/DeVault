import { Body, Controller, Get, Inject, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  cancelLiquidationRequestSchema,
  liquidationStatusSchema,
  openLiquidationRequestSchema,
  placeBidRequestSchema,
  scheduleLiquidationRequestSchema,
} from '@depawn/contracts';
import type {
  CancelLiquidationRequest,
  LiquidationListResponse,
  LiquidationResponse,
  MyBidsResponse,
  OpenLiquidationRequest,
  PlaceBidRequest,
  ScheduleLiquidationRequest,
  SettlementResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { LiquidationStatus } from '../../../domain/lending/liquidation';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { liquidationIdOf, loanIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { domainErrorStatusFor } from '../../shared/http/domain-error-status';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toSettlementRefDto } from '../../shared/http/money.mapper';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { CancelLiquidationUseCase } from '../application/cancel-liquidation.use-case';
import { CloseLiquidationUseCase } from '../application/close-liquidation.use-case';
import { LiquidationQuery } from '../application/liquidation.query';
import { MyBidsQuery } from '../application/my-bids.query';
import { OpenLiquidationUseCase } from '../application/open-liquidation.use-case';
import { PlaceBidUseCase } from '../application/place-bid.use-case';
import { ReclaimBidUseCase } from '../application/reclaim-bid.use-case';
import { ScheduleLiquidationUseCase } from '../application/schedule-liquidation.use-case';
import { isoOf, toLiquidationResponse } from './lending-response.mapper';

@Controller()
export class LiquidationController {
  constructor(
    private readonly scheduleLiquidation: ScheduleLiquidationUseCase,
    private readonly openLiquidation: OpenLiquidationUseCase,
    private readonly placeBid: PlaceBidUseCase,
    private readonly closeLiquidation: CloseLiquidationUseCase,
    private readonly reclaimBid: ReclaimBidUseCase,
    private readonly cancelLiquidation: CancelLiquidationUseCase,
    private readonly liquidations: LiquidationQuery,
    private readonly myBidsQuery: MyBidsQuery,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  @Roles('OPERATIONS')
  @Post('loans/:loanId/liquidations')
  @UseInterceptors(IdempotencyInterceptor)
  async schedule(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(scheduleLiquidationRequestSchema))
    body: ScheduleLiquidationRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.scheduleLiquidation.execute({
      loanId: loanIdOf(loanId),
      requestedBy: account.id,
      reservePrice: toMoney(body.reservePrice),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  /* Calling off a sale that was scheduled and never opened. Only from
     SCHEDULED, because an open sale holds every bidder's money and nothing
     gives it back in bulk (docs/14-state-machines.md). */
  @Roles('OPERATIONS')
  @Post('liquidations/:liquidationId/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(cancelLiquidationRequestSchema))
    body: CancelLiquidationRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.cancelLiquidation.execute({
      liquidationId: liquidationIdOf(liquidationId),
      requestedBy: account.id,
      reason: body.reason,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  @Roles('OPERATIONS')
  @Post('liquidations/:liquidationId/open')
  @UseInterceptors(IdempotencyInterceptor)
  async open(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(openLiquidationRequestSchema)) body: OpenLiquidationRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.openLiquidation.execute({
      liquidationId: liquidationIdOf(liquidationId),
      requestedBy: account.id,
      biddingWindowMs: BigInt(body.biddingWindowMs),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  /* A bidder's own bids, which nothing answered before. Money committed to a
     sale is as invisible as money committed to an offer, and a beaten bid
     stays committed until its owner asks for it back (rule M8). */
  @Get('me/bids')
  async myBids(@CurrentAccount() account: Account): Promise<MyBidsResponse> {
    const rows = await this.myBidsQuery.listFor(account.id);
    return {
      items: rows.map((row) => ({
        id: row.id,
        liquidationId: row.liquidationId,
        itemDescription: row.itemDescription,
        receiptId: row.receiptId,
        hasPhotograph: row.hasPhotograph,
        amount: { minorUnits: row.amountMinorUnits.toString(), currency: row.currency },
        placedAt: row.placedAt.toISOString(),
        liquidationStatus: row.liquidationStatus,
        closesAt: row.closesAt === null ? null : row.closesAt.toISOString(),
        isStanding: row.isStanding,
        isHoldHeld: row.isHoldHeld,
      })),
      asOf: isoOf(this.clock.now()),
    };
  }

  @Get('liquidations')
  async list(
    @Query('status', new ZodValidationPipe(liquidationStatusSchema.optional()))
    status?: LiquidationStatus,
  ): Promise<LiquidationListResponse> {
    const items = await this.liquidations.list(status);
    return { items: items.map(toLiquidationResponse) };
  }

  @Get('liquidations/:liquidationId')
  async read(@Param('liquidationId') liquidationId: string): Promise<LiquidationResponse> {
    const liquidation = await this.liquidations.read(liquidationIdOf(liquidationId));
    if (liquidation === null) {
      throw new DomainErrorHttpException(
        { code: 'NOT_FOUND', message: 'The liquidation does not exist.' },
        404,
      );
    }
    return toLiquidationResponse(liquidation);
  }

  @Post('liquidations/:liquidationId/bids')
  @UseInterceptors(IdempotencyInterceptor)
  async bid(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(placeBidRequestSchema)) body: PlaceBidRequest,
  ): Promise<LiquidationResponse> {
    const result = await this.placeBid.execute({
      liquidationId: liquidationIdOf(liquidationId),
      bidderAccountId: account.id,
      amount: toMoney(body.amount),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value);
  }

  /* Any bidder may pull back a beaten bid; nobody else may pull it for
     them, which the use case checks against the bid's owner. */
  @Post('liquidations/:liquidationId/bids/:bidId/reclaim')
  @UseInterceptors(IdempotencyInterceptor)
  async reclaim(
    @Param('liquidationId') liquidationId: string,
    @Param('bidId') bidId: string,
    @CurrentAccount() account: Account,
  ): Promise<SettlementResponse> {
    const result = await this.reclaimBid.execute({
      liquidationId: liquidationIdOf(liquidationId),
      bidId,
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }

  @Roles('OPERATIONS')
  @Post('liquidations/:liquidationId/close')
  @UseInterceptors(IdempotencyInterceptor)
  async close(
    @Param('liquidationId') liquidationId: string,
    @CurrentAccount() account: Account,
  ): Promise<LiquidationResponse> {
    const result = await this.closeLiquidation.execute({
      liquidationId: liquidationIdOf(liquidationId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return toLiquidationResponse(result.value.liquidation);
  }
}
