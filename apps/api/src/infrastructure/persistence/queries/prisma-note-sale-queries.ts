import { Injectable } from '@nestjs/common';
import type { NoteSale as NoteSaleRow } from '@prisma/client';
import { calculateAccruedInterest } from '../../../domain/lending/interest-calculator';
import type {
  NoteSaleQueries,
  NoteSaleSummaryReadModel,
} from '../../../domain/ports/note-sale-queries.port';
import type { AccountId } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaNoteSaleQueries implements NoteSaleQueries {
  constructor(private readonly prisma: PrismaService) {}

  async browseOpen(now: Instant): Promise<readonly NoteSaleSummaryReadModel[]> {
    const rows = await this.prisma.noteSale.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    return this.priced(rows, now);
  }

  async mine(accountId: AccountId, now: Instant): Promise<readonly NoteSaleSummaryReadModel[]> {
    const rows = await this.prisma.noteSale.findMany({
      where: { sellerAccountId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    return this.priced(rows, now);
  }

  async byId(id: string, now: Instant): Promise<NoteSaleSummaryReadModel | null> {
    const row = await this.prisma.noteSale.findUnique({ where: { id } });
    if (row === null) {
      return null;
    }
    const [readModel] = await this.priced([row], now);
    return readModel ?? null;
  }

  /* The three figures a buyer compares are priced here, with the same
     arithmetic the payoff quote uses, so the chart and a repayment can
     never disagree about what a position is worth. */
  private async priced(
    rows: readonly NoteSaleRow[],
    now: Instant,
  ): Promise<NoteSaleSummaryReadModel[]> {
    if (rows.length === 0) {
      return [];
    }
    const loans = await this.prisma.loan.findMany({
      where: { id: { in: rows.map((row) => row.loanId) } },
    });
    const loanById = new Map(loans.map((loan) => [loan.id, loan]));
    const receipts = await this.prisma.custodyReceipt.findMany({
      where: { id: { in: loans.map((loan) => loan.receiptId) } },
      select: { id: true, itemDescription: true, itemCategory: true },
    });
    const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]));

    return rows.flatMap((row) => {
      const loan = loanById.get(row.loanId);
      const receipt = loan === undefined ? undefined : receiptById.get(loan.receiptId);
      if (loan === undefined || receipt === undefined) {
        return [];
      }
      const currency = currencyOf(loan.currency);
      const principal = Money.of(loan.principalMinorUnits, currency);
      const startedAt = Instant.fromEpochMilliseconds(BigInt(loan.startedAt.getTime()));
      const maturesAt = Instant.fromEpochMilliseconds(BigInt(loan.maturesAt.getTime()));
      const accruedInterest = calculateAccruedInterest(
        principal,
        loan.annualPercentageRateBasisPoints,
        startedAt,
        maturesAt,
        now,
      );
      const maturityValue = principal.plus(
        calculateAccruedInterest(
          principal,
          loan.annualPercentageRateBasisPoints,
          startedAt,
          maturesAt,
          maturesAt,
        ),
      );
      return [
        {
          id: row.id,
          loanId: row.loanId,
          lenderNoteId: row.lenderNoteId,
          sellerAccountId: row.sellerAccountId,
          status: row.status,
          askPrice: Money.of(row.askPriceMinorUnits, currencyOf(row.currency)),
          createdAt: Instant.fromEpochMilliseconds(BigInt(row.createdAt.getTime())),
          itemDescription: receipt.itemDescription,
          itemCategory: receipt.itemCategory,
          principal,
          annualPercentageRateBasisPoints: loan.annualPercentageRateBasisPoints,
          startedAt,
          maturesAt,
          accruedInterest,
          currentValue: principal.plus(accruedInterest),
          maturityValue,
        },
      ];
    });
  }
}
