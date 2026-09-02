import type { ReactElement } from 'react';
import type { StatusTone } from './status-badge';

export interface MeterProps {
  /* How full, in basis points. Clamped here as well as by the caller: a bar
     that trusted its input would paint outside its own track. */
  readonly filledBasisPoints: number;
  readonly tone: StatusTone;
  /* What is being measured, for a screen reader that reaches the bar with no
     column header to lean on. */
  readonly label: string;
  /* The reading in words. Announced instead of a bare percentage, because
     "nine days left" is the answer and "seventy percent" is homework. */
  readonly valueText: string;
  readonly testId?: string | undefined;
}

const fillByTone: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral',
  active: 'bg-status-active',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
};

/* One filled track, for anything in the product that is part way through
   something: a term running down, interest building up.

   It draws the bar and nothing else. Whatever words go with it belong to the
   caller, because the figures under a term and the figures under an accrual
   are laid out differently and a component that owned both would grow a
   variant for each. Colour carries nothing on its own here: every caller
   states the same reading in words beside it. */
export function Meter({
  filledBasisPoints,
  tone,
  label,
  valueText,
  testId,
}: MeterProps): ReactElement {
  const percent = Math.min(100, Math.max(0, filledBasisPoints / 100));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={valueText}
      data-testid={testId}
      /* `bg-edge` rather than a sunken surface: on the dark floor an unfilled
         track was invisible, so a loan that had barely started looked like a
         row with a missing column. */
      className="block h-1.5 w-full overflow-hidden rounded-full bg-edge"
    >
      <span
        className={`block h-full rounded-full transition-[width] duration-control ease-enter ${fillByTone[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
