import type { NoteSaleSummary } from '@depawn/contracts';
import { CurrencyMark, Money, ValueScale, formatAmount } from '@depawn/ui';
import type { ReactElement } from 'react';
import { scaleOf, tradeOf } from './sale-figures';

/* The trade as an arc rather than as four figures in a column.

   Money out now on the left, money back at maturity on the right, and between
   them a line carrying all four amounts at the distances they really sit
   apart. The two stretches on that line are the two reasons to buy: what the
   discount hands over immediately, and what the remaining term still pays. A
   reader who only glances gets the two ends and the colour; a reader who
   stops gets the arithmetic without doing any. */
export function SaleTradeFigures({
  sale,
  size = 'row',
}: {
  readonly sale: NoteSaleSummary;
  readonly size?: 'row' | 'detail';
}): ReactElement {
  const trade = tradeOf(sale);
  const scale = scaleOf(sale);
  const amount = size === 'detail' ? 'text-2xl' : 'text-xl';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-body text-[11px] uppercase tracking-wide text-ink-secondary">
            You pay
          </p>
          <p
            data-testid="figure-pay"
            className={`font-figure ${amount} font-semibold tabular-nums text-ink-primary`}
          >
            <Money value={sale.askPrice} />
          </p>
        </div>

        <span aria-hidden="true" className="pb-2 font-body text-sm text-ink-secondary">
          &rarr;
        </span>

        <div className="min-w-0 text-right">
          <p className="font-body text-[11px] uppercase tracking-wide text-ink-secondary">
            You receive {trade.receiveOn}
          </p>
          <p
            data-testid="figure-receive"
            className={`font-figure ${amount} font-semibold tabular-nums text-ink-primary`}
          >
            <Money value={sale.maturityValue} />
          </p>
          {/* The gain sits under the figure it is a gain on, in the one
              colour spent on this card. It was a bordered chip below, which
              made the number a reader is here for look like a footnote. */}
          <p
            data-testid="figure-profit"
            className={`font-figure text-sm font-semibold tabular-nums ${
              trade.isProfitable ? 'text-market-favourable' : 'text-market-adverse'
            }`}
          >
            {trade.profitMinorUnits < 0n ? '' : '+'}
            <CurrencyMark currency={trade.currency} />{' '}
            {formatAmount({
              minorUnits: trade.profitMinorUnits.toString(),
              currency: trade.currency,
            })}
            {' \u00b7 '}
            {trade.profitShare}
          </p>
        </div>
      </div>

      <ValueScale
        marks={scale.marks}
        segments={scale.segments}
        currency={sale.askPrice.currency}
        label="What this position costs against what it is worth"
        testId="sale-scale"
      />
    </div>
  );
}
