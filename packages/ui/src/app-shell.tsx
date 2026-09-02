import type { ReactElement, ReactNode } from 'react';

export interface AppShellProps {
  readonly productName: string;
  /* The top row of links. Ignored when a rail is given, because two primary
     navigations on one screen is two places to look for the same thing. */
  readonly navigation?: ReactNode;
  /* A NavRail down the left instead of links along the top. Optional so the
     vault console and the admin keep the shape they have. */
  readonly rail?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /* 'terminal' switches the density tokens for the vault console. 'floor' is
     the marketplace workspace, the one scope permitted to fork the palette
     (docs/13-design-system.md, P0.6 amendment). */
  readonly surface?: 'default' | 'terminal' | 'floor';
  /* The workspace manages its own scrolling per pane, so it needs the shell
     to give it the viewport rather than a padded document flow. */
  readonly fills?: boolean;
}

export function AppShell({
  productName,
  navigation,
  rail,
  actions,
  children,
  surface = 'default',
  fills = false,
}: AppShellProps): ReactElement {
  const header = (
    <header className="flex min-h-row items-center justify-between gap-4 border-b border-edge bg-surface-raised px-4">
      <span className="font-heading text-base font-semibold">{productName}</span>
      {rail === undefined && navigation !== undefined ? (
        <nav aria-label="Primary" className="flex items-center gap-4">
          {navigation}
        </nav>
      ) : null}
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );

  const body = <main className={fills ? 'min-h-0 flex-1' : 'flex-1 p-6'}>{children}</main>;

  return (
    <div
      data-surface={surface === 'default' ? undefined : surface}
      className={`flex bg-surface-base font-body text-ink-primary ${
        fills ? 'h-screen min-h-0' : 'min-h-screen'
      } ${rail === undefined ? 'flex-col' : 'flex-row'}`}
    >
      {rail}
      {/* The rail owns the full height and the header sits inside the column
          beside it, so a page that scrolls does not take the destinations
          with it. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        {body}
      </div>
    </div>
  );
}
