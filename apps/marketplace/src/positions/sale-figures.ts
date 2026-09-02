import { nameForCategory } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { formatInstant, formatMoney, formatRate } from '@depawn/ui';
import type { ValueScaleMark, ValueScaleSegment } from '@depawn/ui';

export function shareOf(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const tenth = Math.trunc((basisPoints % 100) / 10);
  return `${whole}.${tenth}%`;
}

function signed(minorUnits: bigint, currency: string): string {
  const sign = minorUnits < 0n ? '' : '+';
  return `${sign}${formatMoney({ minorUnits: minorUnits.toString(), currency })}`;
}

export interface SaleTrade {
  /* The two figures the decision is between, and the gap that makes it one. */
  readonly pay: string;
  readonly receive: string;
  readonly receiveOn: string;
  readonly profit: string;
  readonly profitShare: string;
  readonly isProfitable: boolean;
  /* Where the price sits against what the position is worth right now, which
     is the part a buyer gets simply for taking it on today. */
  readonly discount: string;
  readonly discountShare: string;
  /* What the two muted marks on the line are, said in full underneath it. */
  readonly lent: string;
  readonly worthToday: string;
}

/* One trade, read from the buyer's side: money out now against money back at
   maturity. Every figure here is a subtraction of two the server priced; none
   of them is a price this screen invented. */
export function tradeOf(sale: NoteSaleSummary): SaleTrade {
  const currency = sale.askPrice.currency;
  const ask = BigInt(sale.askPrice.minorUnits);
  const maturity = BigInt(sale.maturityValue.minorUnits);
  const today = BigInt(sale.currentValue.minorUnits);
  const profit = maturity - ask;
  const discount = today - ask;

  return {
    pay: formatMoney(sale.askPrice),
    receive: formatMoney(sale.maturityValue),
    receiveOn: formatInstant(sale.maturesAt, 'date'),
    profit: signed(profit, currency),
    profitShare: ask === 0n ? '0.0%' : shareOf(Number((profit * 10_000n) / ask)),
    isProfitable: profit >= 0n,
    discount: signed(discount, currency),
    discountShare: today === 0n ? '0.0%' : shareOf(Number((discount * 10_000n) / today)),
    lent: formatMoney(sale.principal),
    worthToday: formatMoney(sale.currentValue),
  };
}

/* The four figures at the distances they sit apart, and the two stretches
   between them that are the reason to buy: what the discount hands over the
   moment the position changes hands, and what the rest of the term still has
   to pay out. */
export function scaleOf(sale: NoteSaleSummary): {
  readonly marks: readonly ValueScaleMark[];
  readonly segments: readonly ValueScaleSegment[];
} {
  const trade = tradeOf(sale);
  return {
    marks: [
      {
        id: 'ask',
        minorUnits: BigInt(sale.askPrice.minorUnits),
        label: 'You pay',
        emphasis: 'primary',
      },
      /* Annotated because these two are the only figures on the card whose
         amount is not printed anywhere else: the price and the payoff are
         already set in full above the line. */
      {
        id: 'lent',
        minorUnits: BigInt(sale.principal.minorUnits),
        label: 'Originally lent',
        caption: 'Lent',
        emphasis: 'muted',
        annotate: true,
      },
      {
        id: 'today',
        minorUnits: BigInt(sale.currentValue.minorUnits),
        label: 'Worth today',
        caption: 'Today',
        emphasis: 'muted',
        annotate: true,
      },
      {
        id: 'maturity',
        minorUnits: BigInt(sale.maturityValue.minorUnits),
        label: 'You receive at maturity',
        emphasis: 'primary',
      },
    ],
    segments: [
      {
        fromId: 'ask',
        toId: 'today',
        label: `${trade.discount} now`,
        tone: 'favourable',
      },
      {
        fromId: 'today',
        toId: 'maturity',
        label: `${signedInterest(sale)} to earn`,
        tone: 'neutral',
      },
    ],
  };
}

function signedInterest(sale: NoteSaleSummary): string {
  const remaining = BigInt(sale.maturityValue.minorUnits) - BigInt(sale.currentValue.minorUnits);
  return signed(remaining, sale.askPrice.currency);
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
