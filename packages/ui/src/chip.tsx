import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { pressable } from './pressable';

/* A small toggle that narrows what a list is showing, or opens the panel
   that does.

   It is a separate component from Tab rather than a size of one because the
   two answer different questions. A tab asks which of these views am I
   looking at, and exactly one is always chosen. A chip asks whether this
   constraint is on, and none of them being on is the ordinary case. Reading
   a row of chips as tabs would suggest a reader has to pick one. */

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly isActive?: boolean;
  readonly icon?: ReactNode;
  /* How many constraints are on behind this chip, for the chip that stands
     in front of a panel of them. Shown rather than described because the
     whole reason for hiding filters is that a reader can still see that
     something is filtered without opening anything. */
  readonly count?: number;
  /* For a chip carrying an icon that already says what it is. The label is
     still required and still reaches a screen reader; it is the drawing that
     replaces it, never the name. */
  readonly isLabelHidden?: boolean;
  /* Declared rather than reached through the spread, because a `data-`
     attribute on a typed component is not part of ButtonHTMLAttributes. */
  readonly testId?: string;
}

export function Chip({
  label,
  isActive = false,
  icon,
  count,
  isLabelHidden = false,
  testId,
  type = 'button',
  className,
  ...rest
}: ChipProps): ReactElement {
  return (
    <button
      type={type}
      data-testid={testId}
      /* A chip with a panel behind it is described by the caller, which sets
         `aria-expanded` and `aria-haspopup` through the spread. A chip that
         only toggles is pressed, and says so here. */
      aria-pressed={rest['aria-haspopup'] === undefined ? isActive : undefined}
      {...rest}
      className={[
        pressable,
        'inline-flex min-h-8 items-center gap-1 rounded-sm border px-2.5',
        'font-body text-xs',
        /* Weight carries the state alongside the tone, because a border
           changing colour is the one signal a reader who cannot separate
           those two hues has nothing to fall back on. */
        isActive
          ? 'border-accent font-semibold text-accent'
          : 'border-edge-strong text-ink-secondary hover:text-ink-primary',
        className ?? '',
      ].join(' ')}
    >
      {icon}
      <span className={isLabelHidden ? 'sr-only' : undefined}>{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="font-figure tabular-nums" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
