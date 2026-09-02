import { formatMoney } from '@depawn/ui';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { copy, orderBook, receiptLife, stations, terms, toneForStatus } from './landing-content';
import { Eyebrow, SectionHeading } from './landing-section';
import { toneChip } from './landing-tone';
import { useScrollProgress } from './use-scroll-progress';

/* The signature moment. One receipt walked through its whole life.

   The load bearing detail is that this is one card changing state, not five
   cards in a row. Its header never moves: the same vault, the same case
   number, the same object. Only the body and the status word change. That is
   what makes the section read as a life rather than as a list, and it is also
   true of the product, where a receipt is one row that keeps being amended. */
export function LandingLife(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);

  const index = Math.min(stations.length - 1, Math.floor(progress * stations.length));
  const within = progress * stations.length - index;
  const station = stations[index] ?? stations[0];
  if (station === undefined) {
    return <section ref={section} />;
  }
  const tone = toneForStatus(station.status);

  return (
    <section ref={section} className="relative h-[560vh] bg-surface-base">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-[75rem] gap-14 px-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col gap-8">
            <Eyebrow>{copy.lifeEyebrow}</Eyebrow>
            <SectionHeading>One object, five states, one row in the ledger.</SectionHeading>

            {/* The rail. Its fill is the reader's own scroll position, so the
                page is telling them where they are as well as where the
                receipt is. */}
            <ol className="relative mt-2 flex flex-col gap-5 pl-8">
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
                      style={{ fontSize: 'clamp(1.1875rem, 2vw, 1.625rem)' }}
                    >
                      {entry.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex items-center">
            <article className="w-full rounded-lg border border-edge bg-surface-raised p-8">
              {/* Never changes. It is the same object throughout. */}
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-5">
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

              {/* Only this part swaps. The header above it does not, which
                  is the whole argument of the section. */}
              <div className="pt-5">
                <p className="max-w-[52ch] text-pretty font-body text-base leading-relaxed text-ink-secondary">
                  {station.body}
                </p>
                <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
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

                <StationDetail label={station.label} within={within} />
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Two stations carry a figure that moves while the reader is inside them.
   Both are derived from the same numbers the order book uses, so a rate
   quoted here cannot disagree with the rate quoted there. */
function StationDetail({
  label,
  within,
}: {
  readonly label: string;
  readonly within: number;
}): ReactElement | null {
  if (label === 'Listed') {
    const standing = 1 + Math.floor(within * 5);
    const rate = within > 0.55 ? 14.9 : 15.4;
    return (
      <p className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-edge pt-5 font-body text-sm text-ink-secondary">
        <span>
          Offers standing{' '}
          <span className="font-figure font-semibold tabular-nums text-ink-primary">
            {Math.min(standing, 5)}
          </span>
        </span>
        <span>
          Best rate{' '}
          <span className="font-figure font-semibold tabular-nums text-accent">
            {rate.toFixed(1)}%
          </span>
        </span>
      </p>
    );
  }

  if (label === 'Maturing') {
    const daysLeft = Math.max(0, Math.round(30 - within * 30));
    const elapsed = 30 - daysLeft;
    const accrued = Math.round(
      (orderBook.principalMinor * (orderBook.settlementAtBestRate.ratePctPerYear / 100) * elapsed) /
        365,
    );
    return (
      <p className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-edge pt-5 font-body text-sm text-ink-secondary">
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

  return null;
}
