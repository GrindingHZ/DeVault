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
  /* Writes this mark above the line with a leader down to its dot. Reserve
     it for marks whose figure is not already stated elsewhere on the card: a
     dot nobody can put a number to is a dot doing nothing. */
  readonly annotate?: boolean;
  /* A word or two for the annotation, since `label` is a full phrase written
     for a screen reader and two of those side by side would not fit. */
  readonly caption?: string;
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

/* Where the line sits inside the box, and where an annotation sits above it.
   Two heights rather than one, alternated: two figures a few percent apart
   would otherwise print over each other, and the gap between them is exactly
   the kind of small difference this line exists to show. */
const trackTop = 44;
const annotationTops = [22, 2] as const;

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

  /* In the order they sit along the line, so the alternating heights land on
     neighbours rather than on whichever order the caller listed them in. */
  const annotated = marks
    .filter((mark) => mark.annotate === true)
    .toSorted((left, right) => Number(left.minorUnits - right.minorUnits));

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
        className="relative"
        style={{ height: trackTop + 8 }}
      >
        {annotated.map((mark, index) => {
          const top = annotationTops[index % annotationTops.length] ?? annotationTops[0];
          const share = shareOf(mark.minorUnits);
          /* Centred on its dot, except at the ends, where a centred label
             would hang off the card and get clipped. */
          const anchor =
            share < 12 ? 'translateX(0)' : share > 88 ? 'translateX(-100%)' : 'translateX(-50%)';
          return (
            <span key={`${mark.id}-annotation`}>
              <span
                data-testid={testId === undefined ? undefined : `${testId}-value-${mark.id}`}
                style={{ left: `${String(share)}%`, top, transform: anchor }}
                className="absolute flex flex-col whitespace-nowrap leading-tight"
              >
                {mark.caption === undefined ? null : (
                  <span className="font-body text-[10px] text-ink-secondary">{mark.caption}</span>
                )}
                <span className="font-figure text-[11px] tabular-nums text-ink-primary">
                  {formatAmount({ minorUnits: mark.minorUnits.toString(), currency })}
                </span>
              </span>
              {/* The leader is what ties a figure to its dot once the label
                  has had to move sideways to fit. */}
              <span
                aria-hidden="true"
                style={{ left: `${String(share)}%`, top: top + 20, height: trackTop - top - 20 }}
                className="absolute w-px bg-edge"
              />
            </span>
          );
        })}

        <span
          aria-hidden="true"
          style={{ top: trackTop }}
          className="absolute inset-x-0 h-px -translate-y-1/2 bg-edge"
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
              style={{ left: `${String(start)}%`, width: `${String(end - start)}%`, top: trackTop }}
              className={`absolute h-0.5 -translate-y-1/2 rounded-full ${trackByTone[segment.tone]}`}
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
            style={{ left: `${String(shareOf(mark.minorUnits))}%`, top: trackTop }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
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
