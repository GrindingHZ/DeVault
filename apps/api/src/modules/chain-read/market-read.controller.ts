import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type {
  ListingDetailResponse,
  ListingsPageResponse,
  MyListingsResponse,
} from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { MarketReadService } from './market-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The open market, read from the chain in the shapes the restored workspace
   speaks: the browse list, a single listing's detail, and the member's own
   open listings. */
@Controller()
export class MarketReadController {
  constructor(private readonly market: MarketReadService) {}

  @Get('listings')
  async browse(): Promise<ListingsPageResponse> {
    try {
      const { items } = await this.market.browse();
      return { items, nextCursor: null };
    } catch (error) {
      throw this.mapped(error);
    }
  }

  @Get('listings/:listingId')
  async detail(@Param('listingId') listingId: string): Promise<ListingDetailResponse> {
    try {
      const detail = await this.market.detail(listingId, Date.now());
      if (detail === null) {
        throw new NotFoundException('This listing is no longer open');
      }
      return detail;
    } catch (error) {
      throw this.mapped(error);
    }
  }

  @Get('me/listings')
  async mine(@CurrentAccount() account: Account): Promise<MyListingsResponse> {
    const address = this.addressOf(account);
    try {
      const { items } = await this.market.mine(address);
      return { items, asOf: new Date().toISOString() };
    } catch (error) {
      throw this.mapped(error);
    }
  }

  private addressOf(account: Account): string {
    if (account.walletAddress === null) {
      throw new DomainErrorHttpException(new WalletNotLinked(), 409);
    }
    return account.walletAddress;
  }

  private mapped(error: unknown): unknown {
    if (error instanceof DeploymentNotFound) {
      return new NotFoundException(error.message);
    }
    return error;
  }
}
