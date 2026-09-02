import { Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
import type { MyListingsResponse, MyOffersResponse, SettlementResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
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
  ) {}

  @Get('listings')
  async myListings(@CurrentAccount() account: Account): Promise<MyListingsResponse> {
    const listings = await this.myListingsQuery.listFor(account.id);
    return { items: listings.map((row) => toMyListingResponse(row, account.id)) };
  }

  @Get('offers')
  async myOffers(@CurrentAccount() account: Account): Promise<MyOffersResponse> {
    const offers = await this.myOffersQuery.listFor(account.id);
    return { items: offers.map((row) => toMyOfferResponse(row, account.id)) };
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
