import type { ReactElement, ReactNode } from 'react';

/* A fixed rail of destinations down the left, icon above label.

   The rail holds no router. Each application wraps a NavRailItem in whatever
   link its router provides, which is what keeps packages/ui free of a
   dependency on TanStack Router. */

export interface NavRailProps {
  readonly children: ReactNode;
  readonly label?: string;
}

export function NavRail({ children, label = 'Primary' }: NavRailProps): ReactElement {
  return (
    <nav
      aria-label={label}
      className="flex w-20 shrink-0 flex-col gap-1 overflow-y-auto border-r border-edge bg-surface-sunken py-2"
    >
      {children}
    </nav>
  );
}

export interface NavRailItemProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isActive?: boolean;
}

/* Selection is carried by a left edge bar and by weight as well as by tone,
   because colour alone is not a signal (docs/DESIGN-BRIEF.md rule 3).

   The whole item is one target rather than the icon being clickable and the
   word beside it not, which is the failure that makes a rail feel imprecise. */
export function NavRailItem({ icon, label, isActive = false }: NavRailItemProps): ReactElement {
  return (
    <span
      data-active={isActive ? 'true' : undefined}
      className={[
        'flex min-h-16 flex-col items-center justify-center gap-1 border-l-2 px-1 py-2 text-center',
        'transition-colors duration-control ease-enter',
        isActive
          ? 'border-l-accent bg-surface-raised font-semibold text-accent'
          : 'border-l-transparent text-ink-secondary hover:bg-surface-raised hover:text-ink-primary',
      ].join(' ')}
    >
      {icon}
      <span className="font-body text-xs leading-tight">{label}</span>
    </span>
  );
}
