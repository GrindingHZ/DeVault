import type { NoteSaleSummary } from '@depawn/contracts';
import { ItemPhotograph, focusRing } from '@depawn/ui';
import type { ReactElement } from 'react';
import { photographOf } from './sale-figures';
import { SaleTermLine } from './sale-term-line';
import { SaleTradeFigures } from './sale-trade-figures';

export interface PositionSaleRowProps {
  readonly sale: NoteSaleSummary;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

/* One position on the market, as an item rather than as a chart.

   The figures are on the row because they are what somebody scans down a list
   to compare; the chart is one press away and answers the next question,
   which is how the value got there. Leading with the chart made every row the
   same height as a graph and buried the numbers under it. */
export function PositionSaleRow({
  sale,
  isSelected,
  onSelect,
}: PositionSaleRowProps): ReactElement {
  return (
    <button
      type="button"
      data-testid="sale-row"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={[
        'flex w-full flex-col gap-3 rounded-lg border p-4 text-left',
        'transition-colors duration-control ease-enter',
        focusRing,
        isSelected
          ? 'border-accent bg-surface-raised'
          : 'border-edge bg-surface-raised hover:border-edge-strong',
      ].join(' ')}
    >
      {/* The photograph leads, because a person recognises the thing they
          are lending against by sight long before they read a description,
          which is the same reason the browse rail leads with one. */}
      <span className="flex items-center gap-3">
        <ItemPhotograph
          src={photographOf(sale)}
          alt={sale.itemDescription}
          size="row"
          testId="sale-photograph"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-heading text-base font-semibold text-ink-primary">
            {sale.itemDescription}
          </span>
          <SaleTermLine sale={sale} />
        </span>
      </span>

      <SaleTradeFigures sale={sale} />
    </button>
  );
}
