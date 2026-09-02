import type { ReactElement } from 'react';
import type { StatusTone } from './status-badge';

export interface TermBarProps {
  /* How far through the term, in basis points. Clamped by the caller at
     maturity, because that is where interest stops. */
  readonly elapsedBasisPoints: number;
  /* Always rendered. The bar is the quick read and the note is the real
     answer: "9 days to maturity" is what somebody actually wants, and a
     length alone cannot say it. */
  readonly note: string;
  readonly tone: StatusTone;
}

const fillByTone: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral',
  active: 'bg-status-active',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
};

/* How far a loan has run. Colour carries nothing on its own here: the note
   below says the same thing in words, and the bar itself reports its value
   to assistive technology rather than relying on a visual length. */
export function TermBar({ elapsedBasisPoints, note, tone }: TermBarProps): ReactElement {
  const percent = Math.min(100, Math.max(0, elapsedBasisPoints / 100));
  return (
    <span className="flex w-full min-w-24 flex-col gap-1">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={note}
        data-testid="term-bar"
        /* `bg-edge` rather than a sunken surface: on the dark floor an
           unfilled track was invisible, so a loan that had barely started
           looked like a row with a missing column. */
        className="block h-1.5 w-full overflow-hidden rounded-full bg-edge"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-control ease-enter ${fillByTone[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="whitespace-nowrap font-body text-xs text-ink-secondary">{note}</span>
    </span>
  );
}
