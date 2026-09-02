import { useRef } from 'react';
import type { ReactElement } from 'react';
import { inventory, liquidityTracks } from './landing-content';
import { liquidity } from './landing-copy';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { useScrollProgress } from './use-scroll-progress';

/* Each track starts a little after the one above it and takes 40 percent of
   the section to fill, so the five of them cascade rather than moving as one
   block. */
const stagger = 0.06;
const rampLength = 0.4;

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function fillFor(progress: number, index: number): number {
  const start = index * stagger;
  return easeOut(Math.min(Math.max((progress - start) / rampLength, 0), 1));
}

/* The second best animation on the page, and the one that carries the idea
   the whole product prices on: the same appraisal buys a different loan
   depending on how fast the object turns back into money.

   The bar and the percentage are scrubbed by the same number, so they are the
   same fact told twice rather than a figure with a decoration beside it. */
/* The row the worked example is done on. The same watch the book bids for,
   so a reader who scrolled past that section recognises the figure. */
const worked = inventory.find((item) => item.name === 'Rolex Watch');

export function LandingLiquidity(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);

  return (
    <section ref={section} className="relative h-[230vh] bg-surface-base">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto w-full max-w-[75rem] px-8">
          <div className="flex flex-col gap-4">
            <Eyebrow>{liquidity.eyebrow}</Eyebrow>
            <SectionHeading>{liquidity.heading}</SectionHeading>
            <SectionLede>{liquidity.lede}</SectionLede>
            {worked === undefined ? null : (
              /* The sum done once, on a real row from the vault, so the bars
                 underneath are read as money rather than as decoration. */
              <p className="mt-2 max-w-[62ch] font-body text-base leading-relaxed text-ink-secondary">
                A <span className="text-ink-primary">{worked.name}</span> appraised at{' '}
                <span className="font-figure font-semibold tabular-nums text-ink-primary">
                  {worked.appraisedDisplay}
                </span>{' '}
                is a watch, and watches lend{' '}
                <span className="font-figure font-semibold tabular-nums text-accent">
                  {worked.ltvPct}%
                </span>
                , so the most you can borrow against it is{' '}
                <span className="font-figure font-semibold tabular-nums text-ink-primary">
                  {worked.maxAdvanceDisplay}
                </span>
                .
              </p>
            )}
          </div>

          <p className="mt-10 font-body text-xs font-semibold uppercase tracking-widest text-ink-secondary">
            {liquidity.barLabel}
          </p>

          <ol className="mt-3 flex flex-col">
            {liquidityTracks.map((track, index) => {
              const fill = fillFor(progress, index);
              /* Matched on the rate rather than the name: a track is titled
                 "Watches" and an item is categorised "Watch", and each cap is
                 unique to one category anyway. */
              const items = inventory.filter((item) => item.ltvPct === track.ltvPct);
              return (
                <li
                  key={track.category}
                  className="flex flex-col gap-2 border-t border-edge py-5 last:border-b"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-4">
                    <h3
                      className="font-heading font-semibold tracking-tight text-ink-primary"
                      style={{ fontSize: 'clamp(1.3125rem, 2.2vw, 1.75rem)' }}
                    >
                      {track.category}
                    </h3>
                    <p className="font-figure font-bold tabular-nums text-accent">
                      <span style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>
                        {Math.round(track.ltvPct * fill)}
                      </span>
                      <span className="ml-0.5 text-base">%</span>
                    </p>
                  </div>

                  <div
                    role="presentation"
                    className="h-2.5 w-full overflow-hidden rounded-sm border border-edge bg-surface-raised"
                  >
                    <span
                      className="block h-full rounded-sm bg-accent"
                      style={{ width: `${String(track.ltvPct * fill)}%` }}
                    />
                  </div>

                  <ul className="flex flex-wrap gap-x-8 gap-y-1">
                    {items.map((item) => (
                      <li key={item.name} className="font-body text-xs text-ink-secondary">
                        {item.name} {item.appraisedDisplay} advances{' '}
                        <span className="font-figure font-semibold tabular-nums text-ink-primary">
                          {item.maxAdvanceDisplay}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
