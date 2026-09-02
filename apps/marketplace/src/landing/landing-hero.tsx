import { useRef } from 'react';
import type { ReactElement } from 'react';
import { HeroArtwork } from './landing-artwork';
import { copy, heroClauses, terms } from './landing-content';
import { Eyebrow } from './landing-section';
import { useScrollProgress } from './use-scroll-progress';

/* Where each clause takes the light. Four thresholds for four clauses, spaced
   so the first one holds while the reader is still arriving and the last one
   holds while they read the action underneath it. */
const thresholds = [0, 0.24, 0.5, 0.76];

function activeIndexFor(progress: number): number {
  let active = 0;
  for (const [index, threshold] of thresholds.entries()) {
    if (progress >= threshold) {
      active = index;
    }
  }
  return active;
}

/* The focus list, and the page's core mechanic.

   Four clauses stacked, exactly one held at full contrast while its
   neighbours dim toward the ground and blur. Scrolling moves the light rather
   than the text, so the sentence a reader is on is the only one competing for
   them. The same mechanic runs again further down the page over the eight
   items in the vault, because it is also how the real marketplace works: a
   rail of things, one of them selected, a panel bound to the selection. */
export function LandingHero(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);
  const active = activeIndexFor(progress);

  return (
    <section ref={section} id="top" className="relative h-[340vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto flex w-full max-w-[75rem] items-center px-8">
          <div className="relative z-10 flex max-w-[34rem] flex-col gap-6 pb-14 pt-24">
            <Eyebrow>{copy.heroEyebrow}</Eyebrow>

            {/* One list, not four headings. A screen reader should get the
                whole argument in order rather than whichever line happens to
                be lit when it arrives. */}
            <h1 className="sr-only">{heroClauses.join(' ')}</h1>
            <ul aria-hidden="true" className="flex flex-col gap-3">
              {heroClauses.map((clause, index) => {
                const distance = Math.abs(index - active);
                const dim =
                  distance === 0
                    ? 'text-ink-primary opacity-100 blur-0'
                    : distance === 1
                      ? 'text-ink-secondary opacity-30 blur-[3px]'
                      : 'text-ink-secondary opacity-15 blur-[6px]';
                return (
                  <li
                    key={clause}
                    className={`max-w-[30ch] font-heading font-semibold leading-[1.08] tracking-tight transition-all duration-panel ease-enter ${dim}`}
                    style={{ fontSize: 'clamp(1.5rem, min(3.4vw, 6.2vh), 3rem)' }}
                  >
                    {clause}
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-6">
              <a
                href="#book"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
              >
                {copy.heroCta}
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </a>
              <p className="max-w-[16rem] font-body text-sm text-ink-secondary">
                Vault <span className="font-mono text-ink-primary">{terms.vault}</span>,{' '}
                {terms.vaultCity}. Rate ceiling {terms.rateCeilingPctPerYear}% per year. Origination
                fee {terms.originationFeePct}%.
              </p>
            </div>
          </div>

          {/* Bleeds off the right edge on purpose, so the page starts wider
              than the window and the reader knows there is more of it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-1/2 hidden h-[42rem] w-[42rem] -translate-y-1/2 lg:block"
          >
            <HeroArtwork progress={progress} />
          </div>
        </div>
      </div>
    </section>
  );
}
