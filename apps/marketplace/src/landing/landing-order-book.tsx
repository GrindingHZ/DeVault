import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { bookOffers, orderBook } from './landing-content';
import type { BookOffer } from './landing-content';

const rowHeight = 44;
const finalStage = 2;

/* The book as it stands at a given stage: everything that has arrived,
   cheapest first. Rows keep their identity across a resort, so the browser
   animates a row moving rather than one row's text becoming another's. */
function bookAt(stage: number): readonly BookOffer[] {
  return [...bookOffers]
    .filter((offer) => offer.arrivesAtStage <= stage)
    .sort((left, right) => left.ratePctPerYear - right.ratePctPerYear);
}

/* Which offer is winning at a given stage, so a caller can quote the rate
   without reimplementing the sort. */
export function bestRateAt(stage: number): number {
  return bookAt(stage)[0]?.ratePctPerYear ?? orderBook.settlementAtBestRate.ratePctPerYear;
}

/* Steps the book on while it is being watched, and stops when it is not.
   A timer that keeps running for a section nobody is looking at is a battery
   drain and a surprise: a reader who scrolls back finds the book somewhere
   they did not leave it. */
export function useBookStage(isRunning: boolean, reduced: boolean): number {
  const [stage, setStage] = useState(reduced ? finalStage : 0);

  useEffect(() => {
    if (reduced) {
      setStage(finalStage);
      return;
    }
    if (!isRunning) {
      return;
    }
    const dwell =
      stage === 0
        ? orderBook.stageDwellMs.toStage1
        : stage === 1
          ? orderBook.stageDwellMs.toStage2
          : orderBook.stageDwellMs.atFinal;
    const timer = setTimeout(
      () => setStage((current) => (current >= finalStage ? 0 : current + 1)),
      dwell,
    );
    return () => clearTimeout(timer);
  }, [stage, isRunning, reduced]);

  return stage;
}

/* The book itself: every lender's offer against one receipt, cheapest at the
   top, undercutting each other while you watch.

   This is the thing a pawn shop cannot do, so it does not get a section of
   its own explaining that it exists. It sits inside the stage of the receipt's
   life where it actually happens, which is the moment the thing is listed. */
export function OrderBookPanel({ stage }: { readonly stage: number }): ReactElement {
  const standing = bookAt(stage);
  const principal = orderBook.principalMinor;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-widest text-status-active">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-active" />
          Live
        </p>
        <p className="font-body text-xs text-ink-secondary">
          {standing.length} offer{standing.length === 1 ? '' : 's'} standing
        </p>
      </div>

      <ul
        aria-live="polite"
        className="relative"
        style={{ height: `${String(bookOffers.length * rowHeight)}px` }}
      >
        {bookOffers.map((offer) => {
          const index = standing.indexOf(offer);
          const hasArrived = index !== -1;
          const isBest = index === 0;
          const slot = hasArrived ? index : standing.length;
          return (
            <li
              key={offer.lender}
              aria-hidden={!hasArrived}
              className="absolute inset-x-0 top-0 transition-all duration-panel ease-enter"
              style={{
                transform: `translateY(${String(slot * rowHeight)}px) scale(${hasArrived ? '1' : '0.97'})`,
                opacity: hasArrived ? 1 : 0,
              }}
            >
              <div
                className={`relative grid h-9 grid-cols-[3.75rem_1fr_5.25rem_2.5rem] items-center overflow-hidden rounded-sm border px-2 transition-colors duration-panel ease-enter ${
                  isBest ? 'border-accent' : 'border-edge'
                }`}
              >
                {/* Depth, and a wash on the winning row. Token colours at an
                    opacity rather than a mixed value. */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 left-0 ${
                    isBest ? 'bg-accent opacity-20' : 'bg-edge-strong opacity-10'
                  }`}
                  style={{ width: `${String((offer.amountMinor / principal) * 100)}%` }}
                />
                <span
                  className={`relative font-figure text-sm tabular-nums ${
                    isBest ? 'font-bold text-ink-primary' : 'font-semibold text-ink-secondary'
                  }`}
                >
                  {offer.ratePctPerYear.toFixed(1)}%
                </span>
                <span className="relative whitespace-nowrap font-mono text-[0.6875rem] text-ink-secondary">
                  {offer.lender}
                </span>
                <span className="relative text-right font-figure text-xs tabular-nums text-ink-primary">
                  {offer.amountDisplay}
                </span>
                <span className="relative text-right">
                  {/* The winner is named, not just coloured. */}
                  {isBest ? (
                    <span className="rounded-sm border border-accent px-1 py-0.5 font-body text-[0.5625rem] font-semibold uppercase tracking-widest text-accent">
                      Best
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
