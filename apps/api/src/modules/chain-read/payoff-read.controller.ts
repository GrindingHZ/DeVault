import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { PayoffQuoteResponse } from '@depawn/contracts';
import { LoansReadService } from './loans-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* What repaying a loan costs right now, read from the chain. */
@Controller('loans')
export class PayoffReadController {
  constructor(private readonly loans: LoansReadService) {}

  @Get(':loanId/payoff-quote')
  async quote(@Param('loanId') loanId: string): Promise<PayoffQuoteResponse> {
    try {
      const quote = await this.loans.payoffQuote(loanId, Date.now());
      if (quote === null) {
        throw new NotFoundException('This loan could not be quoted');
      }
      return {
        loanId: quote.loanId,
        principal: quote.principal,
        accruedInterest: quote.accruedInterest,
        total: quote.total,
        quotedAt: new Date(quote.quotedAtMs).toISOString(),
        validUntil: new Date(quote.validUntilMs).toISOString(),
      };
    } catch (error) {
      if (error instanceof DeploymentNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
