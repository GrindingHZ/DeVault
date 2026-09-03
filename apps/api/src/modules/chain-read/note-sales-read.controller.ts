import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { BrowseNoteSalesResponse, MyNoteSalesResponse } from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { NoteSalesReadService } from './note-sales-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The secondary market, read from the chain: the sales a lender can buy, and
   the member's own sales. A member cannot buy their own note, so the browse
   leaves theirs out. */
@Controller()
export class NoteSalesReadController {
  constructor(private readonly sales: NoteSalesReadService) {}

  @Get('market/note-sales')
  async browse(@CurrentAccount() account: Account): Promise<BrowseNoteSalesResponse> {
    const address = this.addressOf(account);
    try {
      const { items } = await this.sales.read(Date.now());
      return {
        items: items.filter((sale) => sale.sellerAccountId !== address && sale.status === 'OPEN'),
        asOf: new Date().toISOString(),
      };
    } catch (error) {
      throw this.mapped(error);
    }
  }

  @Get('me/note-sales')
  async mine(@CurrentAccount() account: Account): Promise<MyNoteSalesResponse> {
    const address = this.addressOf(account);
    try {
      const { items } = await this.sales.read(Date.now());
      return { items: items.filter((sale) => sale.sellerAccountId === address), asOf: new Date().toISOString() };
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
