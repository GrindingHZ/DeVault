import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { StepArtwork } from './landing-artwork';
import { copy, howItWorks } from './landing-content';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { useScrollProgress } from './use-scroll-progress';

/* Each card pins a little lower than the one before it, so the stack stays
   visible at the top as later cards slide over. */
const tops = ['top-[6.5rem]', 'top-[7.375rem]', 'top-[8.25rem]', 'top-[9.125rem]', 'top-[10rem]'];

/* How much of each card the next one has covered, 0 to 1.

   Read from the live boxes rather than from section progress, because the
   cards are different heights and a single progress number would move them
   out of step with what the reader can actually see. */
function useCoverRatios(
  container: React.RefObject<HTMLElement | null>,
  count: number,
  progress: number,
): readonly number[] {
  const [ratios, setRatios] = useState<readonly number[]>(() =>
    Array.from({ length: count }, () => 0),
  );

  useEffect(() => {
    const root = container.current;
    if (root === null) {
      return;
    }
    const cards = [...root.querySelectorAll('[data-step-card]')];
    setRatios(
      cards.map((card, index) => {
        const next = cards[index + 1];
        if (next === undefined) {
          return 0;
        }
        const box = card.getBoundingClientRect();
        const nextBox = next.getBoundingClientRect();
        return Math.min(Math.max((box.bottom - nextBox.top) / box.height, 0), 1);
      }),
    );
    /* Recomputed whenever the shared ticker moves the section on. */
  }, [container, count, progress]);

  return ratios;
}

/* Five steps that genuinely are a sequence, so numbering them is information
   rather than decoration. The stack is the point: a covered card recedes
   instead of vanishing, so the reader can see how far through the process
   they are without a progress bar telling them. */
export function LandingHow(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);
  const covers = useCoverRatios(section, howItWorks.length, progress);

  return (
    <section ref={section} id="how" className="scroll-mt-24 bg-surface-base py-[8rem]">
      <div className="mx-auto w-full max-w-[68rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>How it works</Eyebrow>
          <SectionHeading>{copy.howHeading}</SectionHeading>
          <SectionLede>{copy.howLede}</SectionLede>
        </div>

        <ol className="mt-16 flex flex-col gap-6">
          {howItWorks.map((step, index) => {
            const cover = covers[index] ?? 0;
            return (
              <li
                key={step.numeral}
                data-step-card
                className={`sticky ${tops[index] ?? tops[0] ?? ''} list-none`}
                style={{
                  transform: `scale(${String(1 - 0.05 * cover)})`,
                  filter: `brightness(${String(1 - 0.3 * cover)})`,
                  transformOrigin: '50% 0%',
                }}
              >
                <div className="flex items-start gap-8 rounded-lg border border-edge bg-surface-raised p-11">
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <span className="font-mono text-xs tracking-widest text-edge-strong">
                      {step.numeral}
                    </span>
                    <h3
                      className="text-balance font-heading font-semibold leading-tight tracking-tight text-ink-primary"
                      style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2.125rem)' }}
                    >
                      {step.heading}
                    </h3>
                    <p className="max-w-[52ch] text-pretty font-body text-base leading-relaxed text-ink-secondary">
                      {step.body}
                    </p>
                  </div>
                  <div aria-hidden="true" className="hidden h-32 w-48 shrink-0 md:block">
                    <StepArtwork index={index} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
