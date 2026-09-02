import type { ReactElement } from 'react';
import { formatAmount } from './money';

export interface ValueScaleMark {
  readonly id: string;
  readonly minorUnits: bigint;
  /* Named for a screen reader and for a pointer, since the line itself shows
     position rather than words. */
  readonly label: string;
  /* Primary marks are the two figures the reader is deciding between. Muted
     marks explain where those two came from. */
  readonly emphasis: 'primary' | 'muted';
}

export interface ValueScaleSegment {
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly tone: 'favourable' | 'neutral';
}

export interface ValueScaleProps {
  readonly marks: readonly ValueScaleMark[];
  /* The stretches between marks that mean something. Drawn lit, because the
     distance between two figures is the whole reason to put them on a line
     instead of in a column. */
  readonly segments?: readonly ValueScaleSegment[];
  readonly currency: string;
  readonly label: string;
  readonly testId?: string;
}

const dotByEmphasis = {
  primary: 'h-3 w-3 border-2 border-surface-raised',
  muted: 'h-2 w-2 border border-surface-raised',
} as const;

const trackByTone = {
  favourable: 'bg-market-favourable',
  neutral: 'bg-status-active',
} as const;

/* Four amounts on one line, at the distances they actually sit apart.

   A column of four figures in the same size and colour makes a reader do the
   subtraction themselves, and most will not. On a line the subtraction is the
   picture: how far the price sits below what the thing is worth, and how much
   further the value has to travel before it matures. */
export function ValueScale({
  marks,
  segments = [],
  currency,
  label,
  testId,
}: ValueScaleProps): ReactElement {
  const amounts = marks.map((mark) => Number(mark.minorUnits));
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const span = high - low;

  /* Everything at the same value puts every mark in the middle, which is the
     honest picture of a line whose figures do not differ. */
  function shareOf(minorUnits: bigint): number {
    return span <= 0 ? 50 : ((Number(minorUnits) - low) / span) * 100;
  }

  function markOf(id: string): ValueScaleMark | undefined {
    return marks.find((mark) => mark.id === id);
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div
        role="img"
        aria-label={`${label}: ${marks
          .map(
            (mark) =>
              `${mark.label} ${formatAmount({ minorUnits: mark.minorUnits.toString(), currency })}`,
          )
          .join(', ')}`}
        className="relative h-3"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-edge"
        />

        {segments.map((segment) => {
          const from = markOf(segment.fromId);
          const to = markOf(segment.toId);
          if (from === undefined || to === undefined) {
            return null;
          }
          const start = Math.min(shareOf(from.minorUnits), shareOf(to.minorUnits));
          const end = Math.max(shareOf(from.minorUnits), shareOf(to.minorUnits));
          return (
            <span
              key={`${segment.fromId}-${segment.toId}`}
              aria-hidden="true"
              data-testid={testId === undefined ? undefined : `${testId}-segment-${segment.fromId}`}
              style={{ left: `${String(start)}%`, width: `${String(end - start)}%` }}
              className={`absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full ${trackByTone[segment.tone]}`}
            />
          );
        })}

        {marks.map((mark) => (
          <span
            key={mark.id}
            /* Titled rather than labelled in place: four labels along a line
               this short would collide, and the figures are stated in full
               underneath it anyway. */
            title={`${mark.label}: ${formatAmount({ minorUnits: mark.minorUnits.toString(), currency })}`}
            data-testid={testId === undefined ? undefined : `${testId}-mark-${mark.id}`}
            style={{ left: `${String(shareOf(mark.minorUnits))}%` }}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              dotByEmphasis[mark.emphasis]
            } ${mark.emphasis === 'primary' ? 'bg-ink-primary' : 'bg-ink-secondary'}`}
          />
        ))}
      </div>

      {segments.length === 0 ? null : (
        /* Each label on the side its own stretch is on, which keeps two of
           them off each other without any measuring. */
        <div className="flex items-baseline justify-between gap-3">
          {segments.map((segment) => (
            <span
              key={`${segment.fromId}-${segment.toId}-label`}
              className={`font-body text-xs ${
                segment.tone === 'favourable' ? 'text-market-favourable' : 'text-status-active'
              }`}
            >
              {segment.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
