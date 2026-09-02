import { useRef } from 'react';
import type { ReactElement } from 'react';
import { HeroArtwork } from './landing-artwork';
import { heroClauses, heroCta, heroEyebrow } from './landing-copy';
import { Eyebrow } from './landing-section';
import { useScrollProgress } from './use-scroll-progress';

/* Where each clause takes the light. One threshold per clause, spaced so the
   first holds while the reader is arriving and the last holds while they read
   the action underneath it. */
const thresholds = [0, 0.34, 0.68];

function activeIndexFor(progress: number): number {
  let active = 0;
  for (const [index, threshold] of thresholds.entries()) {
    if (progress >= threshold) {
      active = index;
    }
  }
  return active;
}

/* The focus list.

   Three clauses stacked, exactly one held at full contrast while its
   neighbours dim toward the ground and blur. Scrolling moves the light rather
   than the text, so the sentence a reader is on is the only one competing for
   them. Three is the whole business model, which is why no section below has
   to explain the flow a second time. */
export function LandingHero({ onSignIn }: { readonly onSignIn: () => void }): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);
  const active = activeIndexFor(progress);

  return (
    <section ref={section} id="top" className="relative h-[260vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto flex w-full max-w-[75rem] items-center gap-10 px-8">
          <div className="relative z-10 flex w-full max-w-[34rem] shrink-0 flex-col gap-6 pb-14 pt-24">
            <Eyebrow>{heroEyebrow}</Eyebrow>

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
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
              >
                Sign in
              </button>
              <a
                href="#life"
                className="inline-flex items-center gap-2 font-body text-sm font-semibold text-ink-secondary transition-colors duration-control ease-enter hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
              >
                {heroCta}
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
            </div>
          </div>

          {/* Sits in the flow beside the text rather than pinned to the
              viewport edge. Absolutely positioned against the full width
              sticky parent, it drifted further from the copy the wider the
              window got, and on a large screen it left a hole between the
              two. As a flex sibling it takes whatever the text does not and
              stays next to it at any width. */}
          <div
            aria-hidden="true"
            className="pointer-events-none relative hidden aspect-square min-w-0 flex-1 lg:-mr-12 lg:block"
          >
            <HeroArtwork progress={progress} />
          </div>
        </div>
      </div>
    </section>
  );
}
