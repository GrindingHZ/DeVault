import { VaultMark } from '@depawn/ui';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { defaultTimeline, terms, toneForTimelineMark } from './landing-content';
import { custody, footer } from './landing-copy';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';
import { toneDot, toneText } from './landing-tone';
import { useEnterProgress } from './use-scroll-progress';

/* Where each stop takes the light, as a fraction of the section's travel. */
const stopThresholds = [0.08, 0.3, 0.52, 0.74];

/* Custody and default in one section, because they are one answer: the object
   never left, so there is nothing to repossess and nothing to chase.

   The timeline is the animation. Its rail fills left to right on scroll and
   runs accent into warning into danger as it goes, so the colour is telling
   the reader the same thing the dates are: this gets more serious the longer
   it runs, and it ends somewhere survivable. Each stop lights as the fill
   reaches it rather than all four arriving together, which is what makes it
   read as a sequence rather than a row of cards. */
export function LandingCustody({ onSignIn }: { readonly onSignIn: () => void }): ReactElement {
  const section = useRef<HTMLElement>(null);
  const progress = useEnterProgress(section);

  return (
    <section
      ref={section}
      id="custody"
      /* A hard edge against the section above it. That one is pinned while it
         is read, so without a rule and a change of ground the two run
         together as the sticky one releases. */
      className="scroll-mt-24 border-t border-edge bg-surface-sunken py-[8rem]"
    >
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>{custody.eyebrow}</Eyebrow>
          <SectionHeading>{custody.heading}</SectionHeading>
          <SectionLede>{custody.lede}</SectionLede>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {[custody.held, custody.money].map((card, index) => (
            <article
              key={card.heading}
              className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-raised p-8 transition-all duration-panel ease-enter"
              style={{
                opacity: progress > 0.04 ? 1 : 0,
                transform: `translateY(${progress > 0.04 ? '0' : '12px'})`,
                transitionDelay: `${String(index * 100)}ms`,
              }}
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

        <div className="mt-16">
          <p className="mb-5 font-body text-xs font-semibold uppercase tracking-widest text-ink-secondary">
            {custody.timelineLabel}
          </p>

          {/* The rail. The gradient is drawn at full width and revealed by a
              clip rather than by growing a box, so the colours stay where
              they belong on the timeline instead of being squashed into
              whatever has been uncovered so far. */}
          <div className="relative h-0.5 w-full bg-edge">
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                clipPath: `inset(0 ${String(100 - progress * 100)}% 0 0)`,
                backgroundImage:
                  'linear-gradient(to right, var(--color-accent-default), var(--color-status-warning), var(--color-status-danger), var(--color-accent-default))',
              }}
            />
          </div>

          <ol className="mt-0 grid gap-8 md:grid-cols-4">
            {defaultTimeline.map((stop, index) => {
              const tone = toneForTimelineMark(stop.mark);
              const isLit = progress > (stopThresholds[index] ?? 1);
              return (
                <li
                  key={stop.mark}
                  className="flex flex-col gap-2 pt-5 transition-opacity duration-panel ease-enter"
                  style={{ opacity: isLit ? 1 : 0.35 }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      /* Sits on the rail above, so a stop lights exactly as
                         the fill arrives at it. */
                      className={`-mt-[1.4rem] h-2.5 w-2.5 rounded-full border-2 border-surface-sunken transition-colors duration-panel ease-enter ${
                        isLit ? toneDot[tone] : 'bg-edge-strong'
                      }`}
                    />
                  </span>
                  <span className="font-mono text-xs tracking-widest text-ink-secondary">
                    {stop.mark}
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
