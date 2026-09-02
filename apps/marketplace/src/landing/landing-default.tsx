import { useRef } from 'react';
import type { ReactElement } from 'react';
import { copy, defaultTimeline, toneForTimelineMark } from './landing-content';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { toneDot, toneText } from './landing-tone';
import { useHasEntered } from './use-scroll-progress';

/* Deliberately not buried.

   A page that explains how a secured loan works and goes quiet about what
   happens when it is not repaid has told half the story, and the half it left
   out is the half a borrower is actually worried about. Saying it plainly is
   worth more trust than omitting it, and the answer is genuinely reassuring:
   nothing is repossessed, because the object never left. */
export function LandingDefault(): ReactElement {
  const section = useRef<HTMLElement>(null);
  const hasEntered = useHasEntered(section, 0.25);

  return (
    <section ref={section} className="scroll-mt-24 bg-surface-sunken py-[8rem]">
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>If you do not repay</Eyebrow>
          <SectionHeading>{copy.defaultHeading}</SectionHeading>
          <SectionLede>{copy.defaultLede}</SectionLede>
        </div>

        <ol className="mt-14 grid gap-8 md:grid-cols-4">
          {defaultTimeline.map((stop, index) => {
            const tone = toneForTimelineMark(stop.mark);
            return (
              <li
                key={stop.mark}
                className="flex flex-col gap-3 border-t-2 border-edge pt-5 transition-opacity duration-panel ease-enter"
                style={{
                  opacity: hasEntered ? 1 : 0.45,
                  transitionDelay: `${String(index * 90)}ms`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full transition-colors duration-panel ease-enter ${
                      hasEntered ? toneDot[tone] : 'bg-edge'
                    }`}
                    style={{ transitionDelay: `${String(index * 90)}ms` }}
                  />
                  <span className="font-mono text-xs tracking-widest text-ink-secondary">
                    {stop.mark}
                  </span>
                </span>
                <h3 className={`font-heading text-lg font-semibold ${toneText[tone]}`}>
                  {stop.heading}
                </h3>
                <p className="text-pretty font-body text-sm leading-relaxed text-ink-secondary">
                  {stop.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
