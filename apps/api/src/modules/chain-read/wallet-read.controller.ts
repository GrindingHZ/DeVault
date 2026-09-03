import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { WalletResponse } from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { DeploymentNotFound, WalletReadService } from './wallet-read.service';

/* The signed-in member's money, read from the chain by the api. A member who
   never linked a wallet has no address to read, and a process with nothing
   published yet has no coin to read against. */
@Controller('chain')
export class WalletReadController {
  constructor(private readonly wallet: WalletReadService) {}

  @Get('wallet')
  async read(@CurrentAccount() account: Account): Promise<WalletResponse> {
    if (account.walletAddress === null) {
      throw new DomainErrorHttpException(new WalletNotLinked(), 409);
    }
    const result = await this.readFor(account.walletAddress);
    return {
      decimals: result.decimals,
      availableBaseUnits: result.figures.availableBaseUnits.toString(),
      lentPrincipalBaseUnits: result.figures.lentPrincipalBaseUnits.toString(),
      interestEarnedBaseUnits: result.figures.interestEarnedBaseUnits.toString(),
      collectableBaseUnits: result.figures.collectableBaseUnits.toString(),
      owedNowBaseUnits: result.figures.owedNowBaseUnits.toString(),
      committedBaseUnits: result.figures.committedBaseUnits.toString(),
      reclaimableBaseUnits: result.figures.reclaimableBaseUnits.toString(),
      cashControlledBaseUnits: result.figures.cashControlledBaseUnits.toString(),
      activeBorrowCount: result.figures.activeBorrowCount,
      items: result.items.map((item) => ({
        objectId: item.objectId,
        appraisedValueBaseUnits: item.appraisedValueBaseUnits.toString(),
        itemCategory: item.itemCategory,
        receiptKey: item.receiptKey,
      })),
      lender: result.lender.map((standing) => ({
        pledgeId: standing.pledgeId,
        status: standing.status,
        principalBaseUnits: standing.principalBaseUnits.toString(),
        earnedSoFarBaseUnits: standing.earnedSoFarBaseUnits.toString(),
        valueAtMaturityBaseUnits: standing.valueAtMaturityBaseUnits.toString(),
        collectableBaseUnits: standing.collectableBaseUnits.toString(),
      })),
      borrower: result.borrower.map((standing) => ({
        pledgeId: standing.pledgeId,
        status: standing.status,
        owedNowBaseUnits: standing.owedNowBaseUnits.toString(),
        owedAtMaturityBaseUnits: standing.owedAtMaturityBaseUnits.toString(),
        graceEndsAtMs: standing.graceEndsAtMs,
      })),
      offers: result.offers.map((standing) => ({
        holdObjectId: standing.holdObjectId,
        pledgeId: standing.pledgeId,
        amountBaseUnits: standing.amountBaseUnits.toString(),
        status: standing.status,
      })),
    };
  }

  private async readFor(owner: string): ReturnType<WalletReadService['read']> {
    try {
      /* Real wall time, not the ClockPort: the pledge timestamps are the chain's
         own, and a demo process runs its clock weeks ahead, which would misread
         every deadline on a real network. */
      return await this.wallet.read(owner, Date.now());
    } catch (error) {
      if (error instanceof DeploymentNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
