import type { ReactElement } from 'react';
import { Meter } from './meter';
import type { StatusTone } from './status-badge';

export interface TermBarProps {
  /* How far through the term, in basis points. Clamped by the caller at
     maturity, because that is where interest stops. */
  readonly elapsedBasisPoints: number;
  /* Always rendered. The bar is the quick read and the note is the real
     answer: "day 21 of 30" is what somebody actually wants, and a length
     alone cannot say it. */
  readonly note: string;
  /* The second line, when there is one. The note says where the term has got
     to and this says what that leaves, which are two different questions and
     a reader should not have to subtract to answer the second. */
  readonly caption?: string | undefined;
  readonly tone: StatusTone;
}

/* How far a loan has run. Colour carries nothing on its own here: the lines
   below say the same thing in words, and the bar itself reports its value to
   assistive technology rather than relying on a visual length. */
export function TermBar({ elapsedBasisPoints, note, caption, tone }: TermBarProps): ReactElement {
  return (
    /* A fixed width, not `w-full`. Inside a table cell a full width bar grew
       the column to whatever was left over and pushed the action button off
       the side of the table. */
    <span className="flex w-24 flex-col gap-1">
      <Meter
        filledBasisPoints={elapsedBasisPoints}
        tone={tone}
        label="Term elapsed"
        valueText={caption === undefined ? note : `${note}, ${caption}`}
        testId="term-bar"
      />
      <span className="whitespace-nowrap font-body text-xs text-ink-primary">{note}</span>
      {caption === undefined ? null : (
        <span className="whitespace-nowrap font-body text-xs text-ink-secondary">{caption}</span>
      )}
    </span>
  );
}
