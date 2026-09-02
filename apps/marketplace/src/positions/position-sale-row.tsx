import type { NoteSaleSummary } from '@depawn/contracts';
import { focusRing } from '@depawn/ui';
import type { ReactElement } from 'react';
import { discountSentenceOf, figuresOf, termLineOf } from './sale-figures';

export interface PositionSaleRowProps {
  readonly sale: NoteSaleSummary;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

/* One position on the market, as an item rather than as a chart.

   The four figures are on the row because they are what somebody scans down a
   list to compare; the chart is one press away and answers the next question,
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
      <span className="flex flex-col gap-0.5">
        <span className="truncate font-heading text-base font-semibold text-ink-primary">
          {sale.itemDescription}
        </span>
        <span className="font-body text-xs text-ink-secondary">{termLineOf(sale)}</span>
      </span>

      <span className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {figuresOf(sale).map((figure) => (
          <span key={figure.label} className="flex flex-col">
            <span className="font-body text-xs text-ink-secondary">{figure.label}</span>
            <span
              data-testid={figure.testId}
              className="font-figure text-sm font-semibold tabular-nums text-ink-primary"
            >
              {figure.value}
            </span>
          </span>
        ))}
      </span>

      <span data-testid="sale-discount" className="font-body text-sm text-market-favourable">
        {discountSentenceOf(sale)}
      </span>
    </button>
  );
}
