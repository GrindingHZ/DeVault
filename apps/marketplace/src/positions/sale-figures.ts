import { nameForCategory } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { formatInstant, formatMoney, formatRate } from '@depawn/ui';
import { discountOf } from './sale-chart';

export interface SaleFigure {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}

/* The four numbers somebody buying a position is comparing, in the order they
   ask them: what was lent, what that is worth now, what it pays if it runs to
   term, and what they are being asked for it. Stated the same way on the row
   and beside the chart, because a figure that changes wording between two
   places reads as two different figures. */
export function figuresOf(sale: NoteSaleSummary): readonly SaleFigure[] {
  return [
    { label: 'Principal', value: formatMoney(sale.principal), testId: 'figure-principal' },
    { label: 'Worth today', value: formatMoney(sale.currentValue), testId: 'figure-current' },
    { label: 'At maturity', value: formatMoney(sale.maturityValue), testId: 'figure-maturity' },
    { label: 'You pay', value: formatMoney(sale.askPrice), testId: 'figure-ask' },
  ];
}

export function shareOf(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const tenth = Math.trunc((basisPoints % 100) / 10);
  return `${whole}.${tenth}%`;
}

/* What the buyer keeps for taking it on, said once and used in both places. */
export function discountSentenceOf(sale: NoteSaleSummary): string {
  const discount = discountOf(sale);
  const amount = formatMoney({
    minorUnits: discount.minorUnits.toString(),
    currency: sale.askPrice.currency,
  });
  return `${amount} (${shareOf(discount.basisPoints)}) below today's value`;
}

export interface TermParts {
  readonly category: string;
  readonly rate: string;
  /* Split from its lead so only the date carries the weight: "matures" is
     the same word on every row and the date is the part a reader is
     comparing. */
  readonly maturesOn: string;
}

export function termPartsOf(sale: NoteSaleSummary): TermParts {
  return {
    category: nameForCategory(sale.itemCategory),
    rate: formatRate(sale.annualPercentageRateBasisPoints),
    maturesOn: formatInstant(sale.maturesAt, 'date'),
  };
}

export function photographOf(sale: NoteSaleSummary): string | null {
  return sale.hasPhotograph ? `/api/v1/receipts/${sale.receiptId}/photo` : null;
}
