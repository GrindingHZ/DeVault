import { nameForCategory } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { Button, Card, ValueChart, formatInstant, formatMoney, formatRate } from '@depawn/ui';
import type { ReactElement } from 'react';
import { discountOf, saleChartSeriesOf } from './sale-chart';

function shareOf(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const tenth = Math.trunc((basisPoints % 100) / 10);
  return `${whole}.${tenth}%`;
}

export interface PositionSaleCardProps {
  readonly sale: NoteSaleSummary;
  readonly asOfMs: number;
  readonly onBuy: () => void;
}

/* One open sale on the secondary market. The chart is the centre: what the
   position is worth today, what it pays at maturity, and how far under both
   the ask sits. The figures repeat the chart in words, never the other way
   around. */
export function PositionSaleCard({ sale, asOfMs, onBuy }: PositionSaleCardProps): ReactElement {
  const discount = discountOf(sale);

  return (
    <Card data-testid="sale-card" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-base font-semibold text-ink-primary">
            {sale.itemDescription}
          </h3>
          <p className="font-body text-xs text-ink-secondary">
            {nameForCategory(sale.itemCategory)} ·{' '}
            {formatRate(sale.annualPercentageRateBasisPoints)} · matures{' '}
            {formatInstant(sale.maturesAt, 'date')}
          </p>
        </div>
      </header>

      <ValueChart
        testId="sale-chart"
        currency={sale.askPrice.currency}
        label={`Value of the ${sale.itemDescription} position over its term against the ask`}
        markedAtMs={asOfMs}
        series={saleChartSeriesOf(sale, asOfMs)}
      />

      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="font-body text-xs text-ink-secondary">Worth today</dt>
          <dd className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
            {formatMoney(sale.currentValue)}
          </dd>
        </div>
        <div>
          <dt className="font-body text-xs text-ink-secondary">Pays at maturity</dt>
          <dd className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
            {formatMoney(sale.maturityValue)}
          </dd>
        </div>
        <div>
          <dt className="font-body text-xs text-ink-secondary">Asking</dt>
          <dd className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
            {formatMoney(sale.askPrice)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid="sale-discount" className="font-body text-sm text-market-favourable">
          {formatMoney({
            minorUnits: discount.minorUnits.toString(),
            currency: sale.askPrice.currency,
          })}{' '}
          ({shareOf(discount.basisPoints)}) below today's value
        </p>
        <Button data-testid="buy-position" onClick={onBuy} className="whitespace-nowrap">
          Buy this position
        </Button>
      </div>
    </Card>
  );
}
