import type { NoteSaleSummary } from '@depawn/contracts';
import type { ValueSeries } from '@depawn/ui';

/* The value line is genuinely straight: interest accrues pro rata and stops
   at maturity (docs/03-ledger-and-money.md), so three server priced points
   draw the whole truth and the client never computes a figure. The ask is a
   reference line across the term, and the gap between the two is the
   product: what a buyer keeps for taking the position over. */
export function saleChartSeriesOf(sale: NoteSaleSummary, asOfMs: number): readonly ValueSeries[] {
  const startMs = Date.parse(sale.startedAt);
  const matureMs = Date.parse(sale.maturesAt);
  return [
    {
      id: 'value',
      label: 'Position value',
      role: 'subject',
      points: [
        { atMs: startMs, minorUnits: BigInt(sale.principal.minorUnits) },
        { atMs: asOfMs, minorUnits: BigInt(sale.currentValue.minorUnits) },
        { atMs: matureMs, minorUnits: BigInt(sale.maturityValue.minorUnits) },
      ],
    },
    {
      id: 'ask',
      label: 'Asking price',
      role: 'reference',
      points: [
        { atMs: startMs, minorUnits: BigInt(sale.askPrice.minorUnits) },
        { atMs: matureMs, minorUnits: BigInt(sale.askPrice.minorUnits) },
      ],
    },
  ];
}

export interface SaleDiscount {
  readonly minorUnits: bigint;
  readonly basisPoints: number;
}

/* A display derivation over two server priced figures, the position.ts
   precedent: nothing here invents a price, it only states the gap. */
export function discountOf(sale: NoteSaleSummary): SaleDiscount {
  const currentValue = BigInt(sale.currentValue.minorUnits);
  const ask = BigInt(sale.askPrice.minorUnits);
  const difference = currentValue - ask;
  return {
    minorUnits: difference,
    basisPoints: currentValue === 0n ? 0 : Number((difference * 10_000n) / currentValue),
  };
}
