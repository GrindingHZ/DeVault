import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { MyOffersResponse } from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { OffersReadService } from './offers-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The member's offers, read from the chain in the shape the portfolio and the
   workspace expect. */
@Controller('me')
export class OffersReadController {
  constructor(private readonly offers: OffersReadService) {}

  @Get('offers')
  async read(@CurrentAccount() account: Account): Promise<MyOffersResponse> {
    if (account.walletAddress === null) {
      throw new DomainErrorHttpException(new WalletNotLinked(), 409);
    }
    try {
      const result = await this.offers.read(account.walletAddress, Date.now());
      return { items: [...result.items], asOf: new Date(result.asOfMs).toISOString() };
    } catch (error) {
      if (error instanceof DeploymentNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
