import { formatMoney } from '@depawn/ui';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { orderBook, receiptLife, stations, terms, toneForStatus } from './landing-content';
import { life } from './landing-copy';
import { OrderBookPanel, bestRateAt, useBookStage } from './landing-order-book';
import { Eyebrow, SectionHeading } from './landing-section';
import { toneChip } from './landing-tone';
import { useIsInView, usePrefersReducedMotion, useScrollProgress } from './use-scroll-progress';

/* One receipt walked through its whole life, and the only long section left.

   The load bearing detail is that this is one card changing state, not five
   cards in a row. Its header never moves: the same vault, the same case
   number, the same object. Only the body and the status word change. That is
   what makes it read as a life rather than a list, and it is also true of the
   product, where a receipt is one row that keeps being amended.

   The order book had a section of its own and no longer does. It belongs to
   the moment the thing is listed, so it sits inside that stage, beside the
   card, where the reader has just been told what listing means. */
export function LandingLife(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);
  const reduced = usePrefersReducedMotion();

  const index = Math.min(stations.length - 1, Math.floor(progress * stations.length));
  const within = progress * stations.length - index;
  /* The book only runs while the reader is standing in the stage it belongs
     to, which is also the only time it is on screen. */
  const isInView = useIsInView(section, 0.3);

  /* The card used to change the instant the threshold passed, and it changed
     height at the same time: 321 pixels at Redeemed against 544 at Listed.
     Two jolts on one scroll. The height is now fixed for every station, and
     the body is swapped behind a fade rather than under the reader.

     `shown` lags `index`: the content fades out, then changes, then fades
     back in, so nothing is ever seen mid swap. */
  const [shown, setShown] = useState(index);
  const [isVisible, setVisible] = useState(true);

  useEffect(() => {
    if (index === shown) {
      return;
    }
    setVisible(false);
    const timer = setTimeout(() => {
      setShown(index);
      setVisible(true);
    }, 140);
    return () => clearTimeout(timer);
  }, [index, shown]);

  const station = stations[shown];
  /* Read off the station being rendered, not the one being scrolled into, so
     the layout and the content it holds never disagree during the fade. */
  const isListed = station?.label === 'Listed';
  const stage = useBookStage(isInView && isListed, reduced);

  if (station === undefined) {
    return <section ref={section} />;
  }
  const tone = toneForStatus(station.status);

  return (
    <section ref={section} id="life" className="relative h-[520vh] scroll-mt-24 bg-surface-sunken">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-[75rem] gap-12 px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-7">
            <Eyebrow>{life.eyebrow}</Eyebrow>
            <SectionHeading>{life.heading}</SectionHeading>

            {/* The rail fill is the reader's own scroll position, so the page
                says where they are as well as where the receipt is. */}
            <ol className="relative mt-1 flex flex-col gap-4 pl-8">
              <span
                aria-hidden="true"
                className="absolute left-[3px] top-2 w-0.5 bg-edge"
                style={{ height: 'calc(100% - 1rem)' }}
              />
              <span
                aria-hidden="true"
                className="absolute left-[3px] top-2 w-0.5 bg-accent transition-all duration-control ease-enter"
                style={{ height: `calc(${String(progress * 100)}% - 1rem)` }}
              />
              {stations.map((entry, entryIndex) => {
                const isActive = entryIndex === index;
                const isPassed = entryIndex < index;
                return (
                  <li key={entry.label} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-8 top-1.5 h-2 w-2 rounded-full transition-all duration-panel ease-enter ${
                        isActive || isPassed ? 'bg-accent' : 'bg-edge-strong'
                      } ${isActive ? 'scale-150' : ''}`}
                    />
                    <span
                      aria-current={isActive ? 'step' : undefined}
                      className={`font-heading font-semibold tracking-tight transition-colors duration-panel ease-enter ${
                        isActive
                          ? 'text-ink-primary'
                          : isPassed
                            ? 'text-ink-secondary'
                            : 'text-edge-strong'
                      }`}
                      style={{ fontSize: 'clamp(1.125rem, 1.9vw, 1.5rem)' }}
                    >
                      {entry.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex items-center">
            <article className="flex min-h-[34rem] w-full flex-col rounded-lg border border-edge bg-surface-raised p-7">
              {/* Never changes. It is the same object throughout. */}
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs tracking-wide text-ink-secondary">
                    {receiptLife.header}
                  </p>
                  <h3 className="mt-1.5 font-heading text-base font-semibold text-ink-primary">
                    {receiptLife.item}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-widest transition-colors duration-panel ease-enter ${toneChip(tone)}`}
                >
                  {station.status}
                </span>
              </header>

              {/* Only this part swaps. The header above it does not, which is
                  the whole argument of the section. */}
              <div
                style={{ opacity: isVisible ? 1 : 0 }}
                className={`grid flex-1 content-start gap-6 pt-5 transition-opacity duration-panel ease-enter ${
                  isListed ? 'lg:grid-cols-[0.92fr_1.08fr]' : ''
                }`}
              >
                <div>
                  <p className="max-w-[46ch] text-pretty font-body text-sm leading-relaxed text-ink-secondary">
                    {station.body}
                  </p>
                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
                    {station.fields.map((field) => (
                      <div key={field.label}>
                        <dt className="font-body text-xs text-ink-secondary">{field.label}</dt>
                        <dd
                          className={`mt-1 text-ink-primary ${
                            field.mono === true
                              ? 'font-mono text-xs'
                              : 'font-figure text-sm font-semibold tabular-nums'
                          }`}
                        >
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {isListed ? null : <StationDetail label={station.label} within={within} />}
                </div>

                {/* The book, in the one stage it belongs to. */}
                {isListed ? (
                  <div className="border-t border-edge pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <OrderBookPanel stage={stage} />
                    <p className="mt-3 font-body text-xs leading-relaxed text-ink-secondary">
                      Every lender sees it at once and undercuts the last. The best rate is{' '}
                      <span className="font-figure font-semibold tabular-nums text-accent">
                        {bestRateAt(stage).toFixed(1)}%
                      </span>{' '}
                      and it only moves one way while the book is live.
                    </p>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Two stations carry a figure that moves while the reader is inside them.
   Both derive from the same numbers the book quotes, so nothing on the page
   can disagree with anything else on it. */
function StationDetail({
  label,
  within,
}: {
  readonly label: string;
  readonly within: number;
}): ReactElement | null {
  if (label !== 'Maturing') {
    return null;
  }
  const daysLeft = Math.max(0, Math.round(30 - within * 30));
  const elapsed = 30 - daysLeft;
  const accrued = Math.round(
    (orderBook.principalMinor * (orderBook.settlementAtBestRate.ratePctPerYear / 100) * elapsed) /
      365,
  );
  return (
    <p className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-edge pt-4 font-body text-sm text-ink-secondary">
      <span>
        Days remaining{' '}
        <span className="font-figure font-semibold tabular-nums text-status-warning">
          {daysLeft}
        </span>
      </span>
      <span>
        Interest accrued{' '}
        <span className="font-figure font-semibold tabular-nums text-ink-primary">
          {formatMoney({ minorUnits: String(accrued), currency: terms.currency })}
        </span>
      </span>
    </p>
  );
}
