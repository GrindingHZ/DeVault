import type { NoteSaleSummary } from '@depawn/contracts';
import { Button, Card, ItemPhotograph, ValueChart, formatMoney } from '@depawn/ui';
import type { ValueReadoutRow } from '@depawn/ui';
import type { ReactElement } from 'react';
import { saleChartOf, saleReadingOf } from './sale-chart';
import { photographOf, shareOf } from './sale-figures';
import { SaleTermLine } from './sale-term-line';
import { SaleTradeFigures } from './sale-trade-figures';

export interface PositionSaleDetailProps {
  readonly sale: NoteSaleSummary;
  readonly asOfMs: number;
  readonly onBuy: () => void;
}

/* The chosen position, and how its value got where it is.

   The chart starts at the principal rather than at today, because the whole
   question a buyer is answering is what the position has earned so far and
   what is still to come. Today is marked on it, so the part of the line that
   is history reads apart from the part that is still to be earned, and moving
   along it reads out what buying now and holding to that day would make. */
export function PositionSaleDetail({ sale, asOfMs, onBuy }: PositionSaleDetailProps): ReactElement {
  const chart = saleChartOf(sale, asOfMs);
  const currency = sale.askPrice.currency;

  /* Worked out for whichever day the pointer is on, and handed to the chart
     to read out beside its own figures. */
  function profitAt(atMs: number): readonly ValueReadoutRow[] {
    const reading = saleReadingOf(sale, chart, atMs);
    if (reading === null) {
      return [];
    }
    if (reading.profitMinorUnits === null) {
      return [{ label: 'Before it was for sale', value: '', tone: 'neutral' }];
    }
    const sign = reading.profitMinorUnits < 0n ? '' : '+';
    const share =
      reading.profitBasisPoints === null ? '' : ` (${sign}${shareOf(reading.profitBasisPoints)})`;
    return [
      {
        label: 'Profit if you buy now',
        value: `${sign}${formatMoney({
          minorUnits: reading.profitMinorUnits.toString(),
          currency,
        })}${share}`,
        tone: reading.profitMinorUnits < 0n ? 'adverse' : 'favourable',
      },
    ];
  }

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
          currency={currency}
          label={`Value of the ${sale.itemDescription} position on each day of its term, against the asking price`}
          markedAtMs={chart.markedAtMs}
          markedLabel="Today"
          extraReadoutFor={profitAt}
          series={chart.series}
        />

        <SaleTradeFigures sale={sale} size="detail" />

        <Button data-testid="buy-position" onClick={onBuy}>
          Buy this position
        </Button>
      </div>
    </Card>
  );
}
