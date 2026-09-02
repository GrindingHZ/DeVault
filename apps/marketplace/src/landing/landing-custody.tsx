import { VaultMark } from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { copy, engineering, terms } from './landing-content';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';

/* The trust section, and the last argument the page makes.

   Static on purpose. The boldness is spent by the time a reader gets here,
   and a claim about somebody physically holding your watch is not improved by
   being animated at you. */
export function LandingCustody(): ReactElement {
  return (
    <section id="custody" className="scroll-mt-24 bg-surface-base py-[8rem]">
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>Why your money is safe</Eyebrow>
          <SectionHeading>{copy.custodyHeading}</SectionHeading>
          <SectionLede>{copy.custodyLede}</SectionLede>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <article className="flex flex-col gap-4 rounded-lg border border-edge bg-surface-raised p-8">
            <h3 className="font-heading text-lg font-semibold text-ink-primary">
              {copy.custodyCardHeading}
            </h3>
            <p className="text-pretty font-body text-sm leading-relaxed text-ink-secondary">
              {copy.custodyCardBody}
            </p>
            {/* Four fields collapsing into one sealed digest. No invented hex
                string: a fake hash on a page about not being able to edit the
                record would be the wrong joke. */}
            <div aria-hidden="true" className="mt-2 flex items-center gap-3">
              <span className="flex flex-1 flex-col gap-1">
                {['Item', 'Appraisal', 'Photograph', 'Seal'].map((field) => (
                  <span
                    key={field}
                    className="rounded-sm border border-edge px-2 py-1 font-mono text-[0.625rem] uppercase tracking-widest text-ink-secondary"
                  >
                    {field}
                  </span>
                ))}
              </span>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-edge-strong"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h14M13 7l5 5-5 5" />
              </svg>
              <span className="flex-1 rounded-sm border border-accent px-2 py-2 text-center font-mono text-[0.625rem] uppercase tracking-widest text-accent">
                Sealed digest
              </span>
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-lg border border-edge bg-surface-raised p-8">
            <h3 className="font-heading text-lg font-semibold text-ink-primary">
              {copy.holdCardHeading}
            </h3>
            <p className="text-pretty font-body text-sm leading-relaxed text-ink-secondary">
              {copy.holdCardBody}
            </p>
            <dl className="mt-2 flex flex-col gap-2">
              <HoldRow label="Offer placed" state="Held" tone="live" />
              <HoldRow label="Outbid" state="Reclaimable by you" tone="neutral" />
              <HoldRow label="Offer accepted" state="Settled" tone="accent" />
            </dl>
          </article>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {engineering.map((card) => (
            <article
              key={card.heading}
              className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-raised p-6"
            >
              <h3 className="font-heading text-base font-semibold text-ink-primary">
                {card.heading}
              </h3>
              <p className="text-pretty font-body text-sm leading-relaxed text-ink-secondary">
                {card.body}
              </p>
              {card.items === undefined ? null : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {card.items.map((entry) => (
                    <li
                      key={entry}
                      className="flex items-center gap-2 font-body text-sm text-ink-primary"
                    >
                      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <div className="mt-20 max-w-[46ch]">
          <Eyebrow>{copy.chainEyebrow}</Eyebrow>
          <p
            className="mt-4 text-pretty font-body leading-snug text-ink-primary"
            style={{ fontSize: 'clamp(1.1875rem, 2.1vw, 1.625rem)' }}
          >
            {copy.chainParagraph}
          </p>
        </div>
      </div>

      <LandingFooter />
    </section>
  );
}

function HoldRow({
  label,
  state,
  tone,
}: {
  readonly label: string;
  readonly state: string;
  readonly tone: 'live' | 'neutral' | 'accent';
}): ReactElement {
  const tones = {
    live: 'border-status-active text-status-active',
    neutral: 'border-edge-strong text-ink-secondary',
    accent: 'border-accent text-accent',
  } as const;
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-edge bg-surface-sunken px-3 py-2">
      <dt className="font-body text-sm text-ink-secondary">{label}</dt>
      <dd
        className={`rounded-sm border px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-widest ${tones[tone]}`}
      >
        {state}
      </dd>
    </div>
  );
}

/* The close. The giant wordmark is SVG text stretched to the container, so it
   fits at any width without measuring anything in JavaScript. */
function LandingFooter(): ReactElement {
  return (
    <footer className="mx-auto mt-24 w-full max-w-[75rem] px-8">
      <div className="flex flex-wrap items-end justify-between gap-8 border-t border-edge pt-12">
        <div className="flex flex-col gap-5">
          <p
            className="max-w-[18ch] text-balance font-heading font-semibold leading-tight tracking-tight text-ink-primary"
            style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.125rem)' }}
          >
            {copy.footerClose}
          </p>
          <Link
            to="/login"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-accent px-5 py-3 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
          >
            Sign in to the marketplace
          </Link>
        </div>
        <dl className="flex flex-col gap-1.5 text-right font-body text-sm text-ink-secondary">
          <Term label="Term">{`${String(terms.termDays)} days`}</Term>
          <Term label="Rate ceiling">{`${String(terms.rateCeilingPctPerYear)}% per year`}</Term>
          <Term label="Origination fee">{`${String(terms.originationFeePct)}%`}</Term>
          <Term label="Grace period">{`${String(terms.gracePeriodDays)} days`}</Term>
          <Term label="Vault">{`${terms.vault}, ${terms.vaultCity}`}</Term>
        </dl>
      </div>

      <div className="mt-16 flex items-center gap-3 text-accent">
        <VaultMark size={34} title="DeVault" />
        <p className="font-body text-xs uppercase tracking-[0.16em] text-ink-secondary">
          {copy.footerMarkCaption}
        </p>
      </div>

      <svg
        viewBox="0 0 1000 176"
        role="img"
        aria-label="DeVault"
        className="mt-8 w-full text-ink-primary"
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
        A demonstration build. Figures shown are the seeded dataset, not live market data.
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
