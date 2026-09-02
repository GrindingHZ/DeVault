import type { NoteSaleSummary } from '@depawn/contracts';
import { interestOver } from '@depawn/ui';
import type { ValuePoint, ValueSeries } from '@depawn/ui';

const oneDayMs = 24 * 60 * 60 * 1000;

/* A long term would otherwise put a tick on every one of its days and ask a
   reader to find one of six hundred. Whole days still, just more of them per
   step, so a hovered tick is always a date rather than a fraction of one. */
const mostTicks = 180;

/* Every day of the term, always including the day it matures. */
function dayTicksOf(startMs: number, matureMs: number): readonly number[] {
  const span = matureMs - startMs;
  if (!Number.isFinite(span) || span <= 0) {
    return [startMs];
  }
  const days = Math.ceil(span / oneDayMs);
  const step = Math.ceil(days / mostTicks) * oneDayMs;
  const ticks: number[] = [];
  for (let at = startMs; at < matureMs; at += step) {
    ticks.push(at);
  }
  ticks.push(matureMs);
  return ticks;
}

export interface SaleChart {
  readonly series: readonly ValueSeries[];
  /* Where the loan stands today, snapped to the tick a reader can hover.
     The exact figure for today is stated in words beside the chart; this is
     only the mark that says which day it is. */
  readonly markedAtMs: number;
}

/* What the position is worth on every day of its term, against what it is
   being sold for.

   The value line is priced with `interestOver`, the same truncating integer
   arithmetic the server accrues with, so the day the term ends the line lands
   exactly on the server's `maturityValue` rather than near it. Smoothed
   monotonically, which curves it without ever leaving the range of the two
   days it is joining, so no day on the line reads as a figure the position
   never had. */
export function saleChartOf(sale: NoteSaleSummary, asOfMs: number): SaleChart {
  const startMs = Date.parse(sale.startedAt);
  const matureMs = Date.parse(sale.maturesAt);
  const principal = BigInt(sale.principal.minorUnits);
  const ask = BigInt(sale.askPrice.minorUnits);
  const ticks = dayTicksOf(startMs, matureMs);

  const value: ValuePoint[] = ticks.map((atMs) => ({
    atMs,
    minorUnits:
      principal +
      interestOver(sale.principal.minorUnits, sale.annualPercentageRateBasisPoints, atMs - startMs),
  }));

  return {
    series: [
      {
        id: 'value',
        label: 'Position value',
        role: 'subject',
        shape: 'smooth',
        points: value,
      },
      {
        /* Flat, on the same ticks, so hovering any day reads out both the
           value and the price side by side. */
        id: 'ask',
        label: 'Asking price',
        role: 'reference',
        points: ticks.map((atMs) => ({ atMs, minorUnits: ask })),
      },
    ],
    markedAtMs: nearestTick(ticks, asOfMs),
  };
}

function nearestTick(ticks: readonly number[], atMs: number): number {
  return ticks.reduce(
    (closest, tick) => (Math.abs(tick - atMs) < Math.abs(closest - atMs) ? tick : closest),
    ticks[0] ?? atMs,
  );
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
