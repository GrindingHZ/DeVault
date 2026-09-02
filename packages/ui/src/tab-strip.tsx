import type { ReactElement, ReactNode } from 'react';
import { pressable } from './pressable';

/* A horizontal strip of mutually exclusive destinations or views.

   Four screens each grew their own version of this control and all four
   disagreed: two paddings, two type sizes, and three different ideas about
   what selected looks like. One of them, the admin navigation, carried
   selection in text colour alone, which DESIGN-BRIEF rule 3 forbids and
   which a reader who cannot separate those two greys simply cannot see.

   Selection is carried here by a bottom edge bar, by weight, and by tone,
   which is NavRailItem's rule turned ninety degrees. That is deliberate: the
   rail and the strip are the same idea on two axes, so a reader who has
   learned one has learned the other.

   The strip holds no router, for the same reason the rail holds none. Use
   `Tab` where selecting changes state in place and `TabItem` inside whatever
   link the application's router provides. */

export interface TabStripProps {
  readonly children: ReactNode;
  /* Names the set for a screen reader. Omit it only when an ancestor already
     names this group, as the shell's `nav` element does, since two labels on
     one control is one more than a reader can use. */
  readonly label?: string;
}

export function TabStrip({ children, label }: TabStripProps): ReactElement {
  return (
    <div
      role={label === undefined ? undefined : 'group'}
      aria-label={label}
      className="flex items-center gap-1"
    >
      {children}
    </div>
  );
}

/* Both shapes below render this, so the two cannot drift apart the way the
   four hand written versions did. */
function classesFor(isActive: boolean): string {
  return [
    'inline-flex min-h-row items-center justify-center gap-1 whitespace-nowrap border-b-2 px-3',
    'font-body text-sm',
    isActive
      ? 'border-b-accent font-semibold text-ink-primary'
      : 'border-b-transparent text-ink-secondary hover:text-ink-primary',
  ].join(' ');
}

export interface TabProps {
  readonly label: string;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly testId?: string;
}

/* Selecting changes what is on the screen rather than where the reader is,
   so this is a toggle in a group and says so with `aria-pressed`. */
export function Tab({ label, isActive, onSelect, testId }: TabProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      data-testid={testId}
      onClick={onSelect}
      className={[pressable, classesFor(isActive)].join(' ')}
    >
      {label}
    </button>
  );
}

export interface TabItemProps {
  readonly label: string;
  readonly isActive: boolean;
}

/* The same tab with no control of its own, for wrapping in a router link.
   A destination is a place rather than a state, so the caller sets
   `aria-current` on the link and this carries only the appearance.

   It lifts and presses like the button version because a reader cannot tell
   which of the two they are pointing at, and should not have to. */
export function TabItem({ label, isActive }: TabItemProps): ReactElement {
  return (
    <span data-active={isActive ? 'true' : undefined} className={classesFor(isActive)}>
      {label}
    </span>
  );
}

/* The link that wraps a TabItem needs the ring and the press, since the span
   inside it is not the thing that takes focus. */
export const tabLinkClasses = [pressable, 'rounded-sm'].join(' ');
