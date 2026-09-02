import type { ReactElement, ReactNode } from 'react';

/* The furniture every section on the landing page shares. Kept here so the
   nine of them keep one vertical rhythm rather than each inventing its own,
   which is the failure mode of a long marketing page assembled section by
   section. */

/* A micro label with a green dot marker. The dot is the only decorative use
   of the accent on the page; everywhere else it means an action or a figure
   that moved the reader's way. */
export function Eyebrow({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-[0.16em] text-ink-secondary">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </p>
  );
}

export interface LandingSectionProps {
  readonly id?: string;
  readonly children: ReactNode;
  /* Alternating grounds give the page its rhythm without a rule between every
     section. */
  readonly ground?: 'base' | 'sunken';
}

export function LandingSection({
  id,
  children,
  ground = 'base',
}: LandingSectionProps): ReactElement {
  return (
    <section
      id={id}
      /* The fixed nav pill would otherwise sit on top of a heading somebody
         has just jumped to. */
      className={`scroll-mt-24 py-[8rem] ${ground === 'sunken' ? 'bg-surface-sunken' : 'bg-surface-base'}`}
    >
      <div className="mx-auto w-full max-w-[75rem] px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <h2
      className="max-w-[22ch] text-balance font-heading font-semibold leading-[1.1] tracking-tight text-ink-primary"
      style={{ fontSize: 'clamp(1.75rem, 3.4vw, 2.875rem)' }}
    >
      {children}
    </h2>
  );
}

export function SectionLede({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p className="max-w-[58ch] text-pretty font-body text-base leading-relaxed text-ink-secondary">
      {children}
    </p>
  );
}

/* A figure, always in the figure face with tabular numerals. Money is never a
   monospace on this page: the identifier face is for things a reader quotes
   one character at a time, and an amount is not one of those. */
export function Figure({
  children,
  size = 'base',
  tone = 'primary',
}: {
  readonly children: ReactNode;
  readonly size?: 'base' | 'large';
  readonly tone?: 'primary' | 'accent' | 'danger';
}): ReactElement {
  const sizes = { base: 'text-[0.9375rem]', large: 'text-[1.375rem]' } as const;
  const tones = {
    primary: 'text-ink-primary',
    accent: 'text-accent',
    danger: 'text-status-danger',
  } as const;
  return (
    <span className={`font-figure font-semibold tabular-nums ${sizes[size]} ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* An identifier: a reference, a serial, a policy number, a vault name. The
   one thing on this page that earns a monospace. */
export function Identifier({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="font-mono text-[0.8125rem] tracking-wide">{children}</span>;
}
