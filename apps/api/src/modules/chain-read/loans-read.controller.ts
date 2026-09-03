import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { loanRoleSchema } from '@depawn/contracts';
import type { MyLoansResponse } from '@depawn/contracts';
import type { Account } from '../../domain/accounts/account';
import { WalletNotLinked } from '../chain/wallet-not-linked.error';
import { CurrentAccount } from '../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../shared/http/domain-error-http.exception';
import { LoansReadService } from './loans-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The member's loans, as borrower or lender, read from the chain and served in
   the shape the restored portfolio expects. */
@Controller('me')
export class LoansReadController {
  constructor(private readonly loans: LoansReadService) {}

  @Get('loans')
  async read(
    @CurrentAccount() account: Account,
    @Query('role') role: string,
  ): Promise<MyLoansResponse> {
    if (account.walletAddress === null) {
      throw new DomainErrorHttpException(new WalletNotLinked(), 409);
    }
    const parsedRole = loanRoleSchema.safeParse(role);
    if (!parsedRole.success) {
      throw new BadRequestException('role must be borrower or lender');
    }
    try {
      /* Real wall time, not the demo clock: the pledge timestamps are the
         chain's own. */
      const result = await this.loans.read(account.walletAddress, parsedRole.data, Date.now());
      return { items: [...result.items], asOf: new Date(result.asOfMs).toISOString() };
    } catch (error) {
      if (error instanceof DeploymentNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
