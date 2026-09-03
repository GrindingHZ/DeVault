import { Controller, Get, NotFoundException } from '@nestjs/common';
import type {
  MarketTapeResponse,
  MyBidsResponse,
  ReceiptListResponse,
  RedemptionRequestListResponse,
} from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { MemberReadService } from './member-read.service';
import { TapeReadService } from './tape-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The rest of the member's chain reads in the web2 shapes. Receipts and
   redemptions are real; the note-sale market and liquidation bids have no chain
   read yet (bids do not exist in self-custody at all), and the market tape is
   not wired, so those answer empty rather than erroring the screens that ask. */
@Controller()
export class MemberReadController {
  constructor(
    private readonly member: MemberReadService,
    private readonly tapeReader: TapeReadService,
  ) {}

  @Get('me/receipts')
  async receipts(@CurrentAccount() account: Account): Promise<ReceiptListResponse> {
    const address = this.addressOf(account);
    try {
      return { items: await this.member.myReceipts(address) };
    } catch (error) {
      throw this.mapped(error);
    }
  }

  @Get('me/redemption-requests')
  async redemptions(@CurrentAccount() account: Account): Promise<RedemptionRequestListResponse> {
    const address = this.addressOf(account);
    try {
      return { items: await this.member.myRedemptions(address) };
    } catch (error) {
      throw this.mapped(error);
    }
  }

  @Get('me/bids')
  bids(): MyBidsResponse {
    return { items: [], asOf: new Date().toISOString() };
  }

  @Get('market/tape')
  async tape(): Promise<MarketTapeResponse> {
    try {
      return { events: await this.tapeReader.read(Date.now(), 20) };
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
