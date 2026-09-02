import type { NoteSaleSummary } from '@depawn/contracts';
import { Button, Card, ItemPhotograph, ValueChart } from '@depawn/ui';
import type { ReactElement } from 'react';
import { saleChartOf } from './sale-chart';
import { discountSentenceOf, figuresOf, photographOf } from './sale-figures';
import { SaleTermLine } from './sale-term-line';

export interface PositionSaleDetailProps {
  readonly sale: NoteSaleSummary;
  readonly asOfMs: number;
  readonly onBuy: () => void;
}

/* The chosen position, and how its value got where it is.

   The chart starts at the principal rather than at today, because the whole
   question a buyer is answering is what the position has earned so far and
   what is still to come. Hovering reads out both lines on the day under the
   pointer, so the gap between the value and the ask is legible on any day of
   the term rather than only at the ends. */
export function PositionSaleDetail({ sale, asOfMs, onBuy }: PositionSaleDetailProps): ReactElement {
  const chart = saleChartOf(sale, asOfMs);

  return (
    <Card data-testid="sale-detail">
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <ItemPhotograph
            src={photographOf(sale)}
            alt={sale.itemDescription}
            size="thumbnail"
            testId="detail-photograph"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate font-heading text-base font-semibold text-ink-primary">
              {sale.itemDescription}
            </h2>
            <SaleTermLine sale={sale} />
          </div>
        </header>

        <ValueChart
          testId="sale-chart"
          currency={sale.askPrice.currency}
          label={`Value of the ${sale.itemDescription} position on each day of its term, against the asking price`}
          markedAtMs={chart.markedAtMs}
          series={chart.series}
        />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figuresOf(sale).map((figure) => (
            <div key={figure.label}>
              <dt className="font-body text-xs text-ink-secondary">{figure.label}</dt>
              <dd
                data-testid={`detail-${figure.testId}`}
                className="font-figure text-sm font-semibold tabular-nums text-ink-primary"
              >
                {figure.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm text-market-favourable">{discountSentenceOf(sale)}</p>
          <Button data-testid="buy-position" onClick={onBuy} className="whitespace-nowrap">
            Buy this position
          </Button>
        </div>
      </div>
    </Card>
  );
}
