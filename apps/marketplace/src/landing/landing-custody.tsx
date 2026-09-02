import { VaultMark } from '@depawn/ui';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { defaultTimeline, terms, toneForTimelineMark } from './landing-content';
import { custody, footer } from './landing-copy';
import { Eyebrow, SectionHeading } from './landing-section';
import { toneDot, toneText } from './landing-tone';
import { useHasEntered } from './use-scroll-progress';

/* Custody and default in one section, because they are one answer.

   They were two, and the second was a whole screen explaining a sale that
   almost never happens. The reassuring part is the first sentence of both:
   the object never left, so there is nothing to repossess and nothing to
   chase. The timeline is four short stops under it rather than a section of
   its own. */
export function LandingCustody({ onSignIn }: { readonly onSignIn: () => void }): ReactElement {
  const section = useRef<HTMLElement>(null);
  const hasEntered = useHasEntered(section, 0.2);

  return (
    <section ref={section} id="custody" className="scroll-mt-24 bg-surface-sunken py-[7rem]">
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>{custody.eyebrow}</Eyebrow>
          <SectionHeading>{custody.heading}</SectionHeading>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {[custody.held, custody.money].map((card) => (
            <article
              key={card.heading}
              className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-raised p-8"
            >
              <h3 className="font-heading text-lg font-semibold text-ink-primary">
                {card.heading}
              </h3>
              <p className="max-w-[46ch] text-pretty font-body text-sm leading-relaxed text-ink-secondary">
                {card.body}
              </p>
            </article>
          ))}
        </div>

        {/* Four stops, one line each. Lights in sequence once as the section
            arrives rather than tracking scroll, because it is a fact to read
            and not a thing to play with. */}
        <ol className="mt-10 grid gap-8 md:grid-cols-4">
          {defaultTimeline.map((stop, index) => {
            const tone = toneForTimelineMark(stop.mark);
            return (
              <li
                key={stop.mark}
                className="flex flex-col gap-2 border-t-2 border-edge pt-4 transition-opacity duration-panel ease-enter"
                style={{
                  opacity: hasEntered ? 1 : 0.4,
                  transitionDelay: `${String(index * 90)}ms`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full transition-colors duration-panel ease-enter ${
                      hasEntered ? toneDot[tone] : 'bg-edge'
                    }`}
                    style={{ transitionDelay: `${String(index * 90)}ms` }}
                  />
                  <span className="font-mono text-xs tracking-widest text-ink-secondary">
                    {stop.mark}
                  </span>
                </span>
                <p className={`font-body text-sm font-semibold ${toneText[tone]}`}>
                  {stop.heading}
                </p>
                <p className="text-pretty font-body text-sm leading-relaxed text-ink-secondary">
                  {custody.timeline[index] ?? stop.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <LandingFooter onSignIn={onSignIn} />
    </section>
  );
}

/* The close. The wordmark is SVG text stretched to the container, so it fits
   at any width without measuring anything in JavaScript. */
function LandingFooter({ onSignIn }: { readonly onSignIn: () => void }): ReactElement {
  return (
    <footer className="mx-auto mt-24 w-full max-w-[75rem] px-8">
      <div className="flex flex-wrap items-end justify-between gap-8 border-t border-edge pt-12">
        <div className="flex flex-col gap-5">
          <p
            className="max-w-[18ch] text-balance font-heading font-semibold leading-tight tracking-tight text-ink-primary"
            style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.125rem)' }}
          >
            {footer.close}
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex w-fit items-center rounded-md bg-accent px-5 py-3 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
          >
            {footer.cta}
          </button>
        </div>
        <dl className="flex flex-col gap-1.5 text-right font-body text-sm text-ink-secondary">
          <Term label="Term">{`${String(terms.termDays)} days`}</Term>
          <Term label="Ceiling">{`${String(terms.rateCeilingPctPerYear)}% p.a.`}</Term>
          <Term label="Fee">{`${String(terms.originationFeePct)}%`}</Term>
          <Term label="Vault">{`${terms.vault}, ${terms.vaultCity}`}</Term>
        </dl>
      </div>

      <div className="mt-14 flex items-center gap-3 text-accent">
        <VaultMark size={30} title="DeVault" />
        <p className="font-body text-xs uppercase tracking-[0.16em] text-ink-secondary">
          {footer.markCaption}
        </p>
      </div>

      <svg
        viewBox="0 0 1000 176"
        role="img"
        aria-label="DeVault"
        className="mt-6 w-full text-ink-primary"
      >
        <text
          x="0"
          y="140"
          textLength="1000"
          lengthAdjust="spacingAndGlyphs"
          fontFamily="var(--font-heading)"
          fontSize="176"
          fontWeight="700"
          letterSpacing="-0.02em"
          fill="currentColor"
        >
          DEVAULT
        </text>
      </svg>

      <p className="mt-6 border-t border-edge pt-6 font-body text-xs text-ink-secondary">
        {footer.finePrint}
      </p>
    </footer>
  );
}

function Term({
  label,
  children,
}: {
  readonly label: string;
  readonly children: string;
}): ReactElement {
  return (
    <div className="flex justify-end gap-3">
      <dt>{label}</dt>
      <dd className="font-figure font-semibold tabular-nums text-ink-primary">{children}</dd>
    </div>
  );
}
