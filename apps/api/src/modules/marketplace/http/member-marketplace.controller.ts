import { Controller, Get, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import type { MyListingsResponse, MyOffersResponse, SettlementResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { offerIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toSettlementRefDto } from '../../shared/http/money.mapper';
import { MyListingsQuery } from '../application/my-listings.query';
import { MyOffersQuery } from '../application/my-offers.query';
import { ReclaimHoldUseCase } from '../application/reclaim-hold.use-case';
import {
  marketplaceStatusFor,
  toMyListingResponse,
  toMyOfferResponse,
} from './marketplace-response.mapper';

@Controller('me')
export class MemberMarketplaceController {
  constructor(
    private readonly reclaimHold: ReclaimHoldUseCase,
    private readonly myListingsQuery: MyListingsQuery,
    private readonly myOffersQuery: MyOffersQuery,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  /* How long anything has left is worked out against this rather than the
     browser, which a demo process runs weeks behind (flow 15). */
  private now(): string {
    return new Date(Number(this.clock.now().epochMilliseconds)).toISOString();
  }

  @Get('listings')
  async myListings(@CurrentAccount() account: Account): Promise<MyListingsResponse> {
    const listings = await this.myListingsQuery.listFor(account.id);
    return { items: listings.map((row) => toMyListingResponse(row, account.id)), asOf: this.now() };
  }

  @Get('offers')
  async myOffers(@CurrentAccount() account: Account): Promise<MyOffersResponse> {
    const offers = await this.myOffersQuery.listFor(account.id);
    return { items: offers.map((row) => toMyOfferResponse(row, account.id)), asOf: this.now() };
  }

  @Post('offers/:offerId/reclaim')
  @UseInterceptors(IdempotencyInterceptor)
  async reclaim(
    @Param('offerId') offerId: string,
    @CurrentAccount() account: Account,
  ): Promise<SettlementResponse> {
    const result = await this.reclaimHold.execute({
      offerId: offerIdOf(offerId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }
}
