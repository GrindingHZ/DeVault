import { useRef } from 'react';
import type { ReactElement } from 'react';
import { inventory, liquidityTracks } from './landing-content';
import type { LiquidityTrack } from './landing-content';
import { liquidity } from './landing-copy';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { useViewportProgress } from './use-scroll-progress';

/* Even at both ends rather than front loaded. A cubic ease out is two thirds
   done a third of the way through, which is most of why the fill looked like
   it had finished before it started. */
function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

/* The row the worked example is done on. The same watch the book bids for,
   so a reader who scrolled past that section recognises the figure. */
const worked = inventory.find((item) => item.name === 'Rolex Watch');

/* One category: the cap, the bar, and the real items priced under it.

   Its own component because it measures its own position. A section wide
   progress was spent before the lower rows were ever on screen, so every bar
   was already full by the time anybody saw it. Reading its own box means each
   row fills as it arrives, and five rows arriving one after another is the
   stagger. */
function Track({ track }: { readonly track: LiquidityTrack }): ReactElement {
  const row = useRef<HTMLLIElement>(null);
  const fill = smoothStep(useViewportProgress(row));
  /* Matched on the rate rather than the name: a track is titled "Watches"
     and an item is categorised "Watch", and each cap is unique to one
     category anyway. */
  const items = inventory.filter((item) => item.ltvPct === track.ltvPct);

  return (
    <li ref={row} className="flex flex-col gap-2 border-t border-edge py-6 last:border-b">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3
          className="font-heading font-semibold tracking-tight text-ink-primary"
          style={{ fontSize: 'clamp(1.3125rem, 2.2vw, 1.75rem)' }}
        >
          {track.category}
        </h3>
        {/* The figure and the bar are scrubbed by the same number, so they are
            one fact told twice rather than a number with a decoration beside
            it. */}
        <p className="font-figure font-bold tabular-nums text-accent">
          {/* The animated figure is decoration for sighted readers; the real
              share is read out once, so assistive technology and any
              un-scrolled snapshot never hear a category lend 0%. */}
          <span className="sr-only">{`${String(track.ltvPct)}%`}</span>
          <span aria-hidden="true">
            <span style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>
              {Math.round(track.ltvPct * fill)}
            </span>
            <span className="ml-0.5 text-base">%</span>
          </span>
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
}

/* What the percentage actually means, and why it differs by category.

   Not pinned. The content grew past a screen once it had a lede and a worked
   example in it, and a sticky box is exactly one screen tall, so the overflow
   sat under the next section and its ground line cut across the last row. In
   normal flow it owns its area. */
export function LandingLiquidity(): ReactElement {
  return (
    <section className="scroll-mt-24 border-t border-edge bg-surface-base py-[8rem]">
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
          {liquidityTracks.map((track) => (
            <Track key={track.category} track={track} />
          ))}
        </ol>
      </div>
    </section>
  );
}
