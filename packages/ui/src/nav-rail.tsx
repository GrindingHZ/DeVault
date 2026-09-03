import type { ReactElement, ReactNode } from 'react';

/* A fixed rail of destinations down the left, icon above label.

   The rail holds no router. Each application wraps a NavRailItem in whatever
   link its router provides, which is what keeps packages/ui free of a
   dependency on TanStack Router. */

export interface NavRailProps {
  readonly children: ReactNode;
  readonly label?: string;
}

/* A column down the left from the medium breakpoint up. Below it the same
   five destinations become a bar along the bottom, where a thumb reaches
   them: a fixed 80px column on a phone took a fifth of the screen and left
   the content to wrap around it. The shell pads the page bottom to match. */
export function NavRail({ children, label = 'Primary' }: NavRailProps): ReactElement {
  return (
    <nav
      aria-label={label}
      className={[
        'flex shrink-0 border-edge bg-surface-sunken',
        'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:h-16 max-md:flex-row max-md:justify-around max-md:border-t',
        'md:w-20 md:flex-col md:gap-1 md:overflow-y-auto md:border-r md:py-2',
      ].join(' ')}
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
        'flex flex-col items-center justify-center gap-1 px-1 py-2 text-center',
        'md:min-h-16 md:border-l-2',
        /* Along the bottom the selection edge sits on top, and each item
           takes an equal share of the bar so the targets stay thumb sized. */
        'max-md:h-full max-md:min-w-16 max-md:flex-1 max-md:border-t-2',
        'transition-colors duration-control ease-enter',
        isActive
          ? 'border-accent bg-surface-raised font-semibold text-accent'
          : 'border-transparent text-ink-secondary hover:bg-surface-raised hover:text-ink-primary',
      ].join(' ')}
    >
      {icon}
      <span className="font-body text-xs leading-tight">{label}</span>
    </span>
  );
}
