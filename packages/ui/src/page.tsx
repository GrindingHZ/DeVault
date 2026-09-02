import type { ReactElement, ReactNode } from 'react';

/* Every screen was a bordered card pinned to the top left of an empty
   viewport, because Card was doing duty as a page wrapper and a card at the
   same time. This separates the two: a page is the frame, a card is a thing
   inside it. */

export interface PageProps {
  readonly children: ReactNode;
  /* Fluid fills the window, which is what a table or a book wants. Reading
     caps the measure, which is what a single form or a column of prose
     wants. Defaulting to fluid because most of this product is data. */
  readonly width?: 'fluid' | 'reading';
}

const widths = {
  fluid: 'max-w-[110rem]',
  reading: 'max-w-3xl',
} as const;

export function Page({ children, width = 'fluid' }: PageProps): ReactElement {
  return (
    <div className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 ${widths[width]}`}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

/* One h1 per screen. Before this no screen had a heading at all, so nothing
   announced what it was to a reader or to a screen reader. */
export function PageHeader({ title, description, actions }: PageHeaderProps): ReactElement {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-edge pb-4">
      <div className="min-w-0">
        <h1 className="font-heading text-lg font-semibold text-ink-primary">{title}</h1>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl font-body text-sm text-ink-secondary">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export interface PageSectionProps {
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/* A band of content under the header. Named rather than left to each screen
   to compose out of divs, because that is how twenty screens ended up with
   twenty different vertical rhythms. */
export function PageSection({
  title,
  description,
  actions,
  children,
}: PageSectionProps): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      {title === undefined && actions === undefined ? null : (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            {title === undefined ? null : (
              <h2 className="font-heading text-base font-semibold text-ink-primary">{title}</h2>
            )}
            {description === undefined ? null : (
              <p className="mt-0.5 font-body text-sm text-ink-secondary">{description}</p>
            )}
          </div>
          {actions === undefined ? null : <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
