import { TabItem, TabStrip, tabLinkClasses } from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

/* Five screens each carried their own copy of this list, so a sixth was
   reachable from one of them and invisible from the others. One list, one
   place to add the next screen.

   Home used to be dropped from the list while the reader was on it, which is
   what you do when you have no way of drawing a link as the current one. The
   strip has one, so every destination stays put and the reader keeps a map
   that does not rearrange itself under them. */
const destinations = [
  { to: '/', label: 'Home' },
  { to: '/liquidations', label: 'Liquidations' },
  { to: '/operations', label: 'Operations' },
  { to: '/parameters', label: 'Parameters' },
  { to: '/reconciliation', label: 'Reconciliation' },
  { to: '/deposits', label: 'Deposits' },
] as const;

export interface AdminNavigationProps {
  /* The screen the reader is on, which is the one link that is not a way of
     leaving it. */
  readonly current: (typeof destinations)[number]['to'];
}

export function AdminNavigation({ current }: AdminNavigationProps): ReactElement {
  /* No label: the shell already wraps this in a nav element that names it,
     and a group inside a named nav gives a screen reader the same list
     twice. */
  return (
    <TabStrip>
      {destinations.map((destination) => (
        <Link
          key={destination.to}
          to={destination.to}
          /* A destination is a place rather than a state, so the current one
             is `aria-current` on the link and never `aria-pressed`. */
          aria-current={destination.to === current ? 'page' : undefined}
          className={tabLinkClasses}
        >
          <TabItem label={destination.label} isActive={destination.to === current} />
        </Link>
      ))}
    </TabStrip>
  );
}
