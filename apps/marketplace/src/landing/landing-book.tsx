import { formatMoney } from '@depawn/ui';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { bookOffers, inventory, orderBook, terms } from './landing-content';
import { book } from './landing-copy';
import type { BookOffer } from './landing-content';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { useIsInView, usePrefersReducedMotion } from './use-scroll-progress';

const rowHeight = 60;
const finalStage = 2;

function money(minorUnits: number): string {
  return formatMoney({ minorUnits: String(minorUnits), currency: terms.currency });
}

/* Interest is recomputed rather than quoted, so the figure cannot drift away
   from the rate sitting above it when either changes. Simple interest over
   the term, which is what the loan actually charges: nothing compounds. */
function interestMinorUnits(principalMinor: number, ratePct: number, days: number): number {
  return Math.round((principalMinor * (ratePct / 100) * days) / 365);
}

/* The listing the book is against, so the advance percentage is the item's
   own loan to value rather than a number repeated by hand. */
const listedItem = inventory.find((item) => item.name === orderBook.listing);

/* The book as it stands at a given stage: everything that has arrived,
   cheapest first. Rows keep their identity across a resort so the browser
   animates a row moving rather than one row's text becoming another's. */
function bookAt(stage: number): readonly BookOffer[] {
  return [...bookOffers]
    .filter((offer) => offer.arrivesAtStage <= stage)
    .sort((left, right) => left.ratePctPerYear - right.ratePctPerYear);
}

export function LandingBook(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const isInView = useIsInView(section, 0.3);
  const reduced = usePrefersReducedMotion();
  /* Reduced motion gets the end state, populated and settled, rather than a
     book that never fills. */
  const [stage, setStage] = useState(reduced ? finalStage : 0);

  useEffect(() => {
    if (reduced) {
      setStage(finalStage);
      return;
    }
    if (!isInView) {
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
  }, [stage, isInView, reduced]);

  const standing = bookAt(stage);
  const best = standing[0];
  const bestRate = best?.ratePctPerYear ?? orderBook.settlementAtBestRate.ratePctPerYear;
  const principal = orderBook.principalMinor;
  const fee = Math.round((principal * terms.originationFeePct) / 100);
  const interest = interestMinorUnits(principal, bestRate, orderBook.termDays);

  return (
    <section ref={section} id="book" className="scroll-mt-24 bg-surface-sunken py-[8rem]">
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>{book.eyebrow}</Eyebrow>
          <SectionHeading>{book.heading}</SectionHeading>
          <SectionLede>{book.lede}</SectionLede>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-lg border border-edge bg-surface-raised p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge pb-4">
              <div className="min-w-0">
                <h3 className="font-heading text-base font-semibold text-ink-primary">
                  {orderBook.listing}
                </h3>
                <p className="mt-1 font-body text-sm text-ink-secondary">
                  Seeking {orderBook.principalDisplay} over {orderBook.termDays} days
                </p>
              </div>
              <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-widest text-status-active">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-active" />
                Live
                <span className="text-ink-secondary">
                  · {standing.length} offer{standing.length === 1 ? '' : 's'}
                </span>
              </p>
            </div>

            <div className="mt-3 grid grid-cols-[6rem_1fr_7.375rem_3.625rem] px-3 pb-2 font-body text-xs font-semibold uppercase tracking-widest text-ink-secondary">
              <span>Rate p.a.</span>
              <span>Lender</span>
              <span className="text-right">Offered</span>
              <span />
            </div>

            {/* Rows are positioned rather than reflowed, so a resort is one
                transform per row and the eye can follow a row moving up. */}
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
                      className={`relative grid h-[3.25rem] grid-cols-[6rem_1fr_7.375rem_3.625rem] items-center overflow-hidden rounded-md border px-3 transition-colors duration-panel ease-enter ${
                        isBest ? 'border-accent' : 'border-edge'
                      }`}
                    >
                      {/* Depth, and on the winning row a wash. Both are token
                          colours at an opacity rather than a mixed value. */}
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-y-0 left-0 ${isBest ? 'bg-accent opacity-20' : 'bg-edge-strong opacity-10'}`}
                        style={{ width: `${String((offer.amountMinor / principal) * 100)}%` }}
                      />
                      {isBest ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 bg-accent opacity-5"
                        />
                      ) : null}
                      <span
                        className={`relative font-figure tabular-nums ${isBest ? 'font-bold text-ink-primary' : 'font-semibold text-ink-secondary'}`}
                      >
                        {offer.ratePctPerYear.toFixed(1)}%
                      </span>
                      <span className="relative font-mono text-xs text-ink-secondary">
                        {offer.lender}
                      </span>
                      <span className="relative text-right font-figure text-sm tabular-nums text-ink-primary">
                        {offer.amountDisplay}
                      </span>
                      <span className="relative text-right">
                        {/* The winner is named, not just coloured. */}
                        {isBest ? (
                          <span className="rounded-sm border border-accent px-1.5 py-0.5 font-body text-[0.625rem] font-semibold uppercase tracking-widest text-accent">
                            Best
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 border-t border-edge pt-4 font-body text-xs leading-relaxed text-ink-secondary">
              {book.footnote}
            </p>
          </div>

          <div className="flex flex-col gap-5 rounded-lg border border-edge bg-surface-raised p-6">
            <p className="font-body text-xs font-semibold uppercase tracking-widest text-ink-secondary">
              {book.settlementLabel}
            </p>
            <p className="flex items-baseline gap-3">
              <span
                className="font-figure font-bold tabular-nums leading-none text-accent transition-all duration-panel ease-enter"
                style={{ fontSize: 'clamp(2.375rem, 4.4vw, 3.375rem)' }}
              >
                {bestRate.toFixed(1)}
              </span>
              <span className="font-body text-base text-ink-secondary">
                % per year, {orderBook.termDays} days
              </span>
            </p>

            <dl className="flex flex-col gap-3 border-t border-edge pt-5">
              <Line label={`Advance, ${String(listedItem?.ltvPct ?? 50)}% of appraised`}>
                {orderBook.principalDisplay}
              </Line>
              <Line label={`Origination fee, ${String(terms.originationFeePct)}%`} tone="danger">
                {orderBook.settlementAtBestRate.originationFeeDisplay}
              </Line>
              <Line label="You receive" strong>
                {money(principal - fee)}
              </Line>
            </dl>

            <dl className="flex flex-col gap-3 border-t border-edge pt-5">
              <Line
                label={`Interest, ${String(orderBook.termDays)} days at ${bestRate.toFixed(1)}%`}
              >
                {money(interest)}
              </Line>
              <Line label="Total repayable" strong>
                {money(principal + interest)}
              </Line>
            </dl>

            <p className="mt-auto font-body text-xs leading-relaxed text-ink-secondary">
              {book.figureNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Line({
  label,
  children,
  tone = 'primary',
  strong = false,
}: {
  readonly label: string;
  readonly children: string;
  readonly tone?: 'primary' | 'danger';
  readonly strong?: boolean;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`font-body text-sm ${strong ? 'text-ink-primary' : 'text-ink-secondary'}`}>
        {label}
      </dt>
      <dd
        className={`font-figure tabular-nums ${strong ? 'text-base font-semibold' : 'text-sm font-medium'} ${
          tone === 'danger' ? 'text-status-danger' : 'text-ink-primary'
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
