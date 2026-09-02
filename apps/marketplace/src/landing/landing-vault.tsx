import { useState } from 'react';
import type { ReactElement } from 'react';
import { StandInArtwork } from './landing-artwork';
import { copy, inventory } from './landing-content';
import { Eyebrow, SectionHeading, SectionLede } from './landing-section';

/* The focus list, second use.

   A rail of things on the left, one of them selected, a panel on the right
   bound to the selection. That is not a marketing device borrowed for the
   occasion: it is exactly how the marketplace behind the sign in button
   works, so the page is demonstrating the interaction rather than decorating
   with one.

   Selection answers click, hover and focus, so the section is fully operable
   from the keyboard and instantly explorable with a mouse. */
export function LandingVault(): ReactElement {
  const [selected, setSelected] = useState(0);
  const item = inventory[selected] ?? inventory[0];
  if (item === undefined) {
    return <section />;
  }

  return (
    <section id="vault" className="scroll-mt-24 bg-surface-sunken py-[8rem]">
      <div className="mx-auto w-full max-w-[75rem] px-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>In the vault</Eyebrow>
          <SectionHeading>{copy.vaultHeading}</SectionHeading>
          <SectionLede>{copy.vaultLede}</SectionLede>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_0.85fr]">
          <ul className="flex flex-col">
            {inventory.map((entry, index) => {
              const isActive = index === selected;
              return (
                <li key={entry.name} className="border-b border-edge">
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    onMouseEnter={() => setSelected(index)}
                    onFocus={() => setSelected(index)}
                    aria-pressed={isActive}
                    className={`flex w-full items-baseline justify-between gap-6 py-5 text-left transition-colors duration-panel ease-enter focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active ${
                      isActive ? 'text-ink-primary' : 'text-ink-secondary opacity-60'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-panel ease-enter ${
                          isActive ? 'bg-accent' : 'bg-transparent'
                        }`}
                      />
                      <span className="font-body text-[1.0625rem] font-semibold">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-figure text-sm tabular-nums">
                      {entry.appraisedDisplay}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-edge bg-surface-raised">
              {/* The photograph that does not exist yet. Labelled as a
                  drawing rather than dressed up as one, because a marketing
                  page implying it holds photographs of sealed items it has
                  not photographed is the one lie this page must not tell. */}
              <div className="relative flex h-56 items-center justify-center border-b border-edge bg-surface-sunken">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, var(--color-border) 0 1px, transparent 1px 11px)',
                  }}
                />
                <div className="relative h-28 w-36">
                  <StandInArtwork kind={item.standIn} />
                </div>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <p className="font-body text-xs font-semibold uppercase tracking-widest text-accent">
                  {item.category}
                </p>
                <h3 className="font-heading text-base font-semibold leading-snug text-ink-primary">
                  {item.name}
                </h3>
                <dl className="grid grid-cols-3 gap-4 border-t border-edge pt-4">
                  <Fact label="Appraised">{item.appraisedDisplay}</Fact>
                  <Fact label="Lends up to">{`${String(item.ltvPct)}%`}</Fact>
                  <Fact label="Maximum advance">{item.maxAdvanceDisplay}</Fact>
                </dl>
                <div className="border-t border-edge pt-4">
                  <p className="font-body text-xs text-ink-secondary">Custody record</p>
                  {item.serials.length === 0 ? (
                    <p className="mt-1 font-body text-sm text-ink-secondary">
                      Sealed on intake, no external serial.
                    </p>
                  ) : (
                    item.serials.map((serial) => (
                      <p key={serial} className="mt-1 break-all font-mono text-xs text-ink-primary">
                        {serial}
                      </p>
                    ))
                  )}
                </div>
                <p className="font-mono text-[0.625rem] uppercase tracking-widest text-edge-strong">
                  {copy.standInCaption}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: string;
}): ReactElement {
  return (
    <div>
      <dt className="font-body text-xs text-ink-secondary">{label}</dt>
      <dd className="mt-1 font-figure text-sm font-semibold tabular-nums text-ink-primary">
        {children}
      </dd>
    </div>
  );
}
