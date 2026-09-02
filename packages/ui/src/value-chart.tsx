import { useState } from 'react';
import type { PointerEvent, ReactElement } from 'react';
import { formatInstant } from './date-time';
import { formatAmount } from './money';

export interface ValuePoint {
  readonly atMs: number;
  readonly minorUnits: bigint;
}

export interface ValueSeries {
  readonly id: string;
  readonly label: string;
  /* Two roles, not two colours. The caller says which series is the subject
     and which is the reference; the chart owns what those look like, so two
     charts in the product cannot disagree about it.

     The pair was checked rather than chosen by eye: accent against
     status-active clears the CVD separation, chroma and contrast floors on
     the dark floor surface. */
  readonly role: 'subject' | 'reference';
  readonly points: readonly ValuePoint[];
}

export interface ValueChartProps {
  readonly series: readonly ValueSeries[];
  readonly currency: string;
  /* Names the whole chart for a screen reader, which cannot read a shape. */
  readonly label: string;
  readonly testId?: string | undefined;
}

/* A wide box. The viewBox is stretched to whatever width the column gives it
   and every stroke is drawn non-scaling, so the geometry is responsive while
   the marks keep the thickness they were specified at. */
const viewWidth = 100;
const viewHeight = 34;

const strokeByRole: Record<ValueSeries['role'], string> = {
  subject: 'stroke-accent',
  reference: 'stroke-status-active',
};

const fillByRole: Record<ValueSeries['role'], string> = {
  subject: 'fill-accent',
  reference: 'fill-status-active',
};

interface Bounds {
  readonly low: number;
  readonly high: number;
  readonly from: number;
  readonly to: number;
}

function boundsOf(series: readonly ValueSeries[]): Bounds | null {
  const values = series.flatMap((one) => one.points.map((point) => Number(point.minorUnits)));
  const stamps = series.flatMap((one) => one.points.map((point) => point.atMs));
  if (values.length === 0 || stamps.length === 0) {
    return null;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  /* A flat series would otherwise divide by zero and paint nothing. Given a
     line that never moved, the honest picture is a line through the middle. */
  const pad = high === low ? Math.max(1, Math.abs(high) * 0.05) : (high - low) * 0.08;
  return {
    low: low - pad,
    high: high + pad,
    from: Math.min(...stamps),
    to: Math.max(...stamps),
  };
}

function xOf(atMs: number, bounds: Bounds): number {
  const span = bounds.to - bounds.from;
  return span <= 0 ? viewWidth / 2 : ((atMs - bounds.from) / span) * viewWidth;
}

function yOf(minorUnits: bigint, bounds: Bounds): number {
  const span = bounds.high - bounds.low;
  return span <= 0
    ? viewHeight / 2
    : viewHeight - ((Number(minorUnits) - bounds.low) / span) * viewHeight;
}

function pathOf(points: readonly ValuePoint[], bounds: Bounds): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${xOf(point.atMs, bounds).toFixed(2)} ${yOf(point.minorUnits, bounds).toFixed(2)}`,
    )
    .join(' ');
}

/* How a value moved, drawn as a line per series over one shared scale.

   One axis, always. Two measures at different scales get two charts rather
   than a second y-axis, which is the single most common way a chart like
   this starts lying. */
export function ValueChart({ series, currency, label, testId }: ValueChartProps): ReactElement {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const bounds = boundsOf(series);
  const subject = series.find((one) => one.role === 'subject') ?? series[0];

  if (bounds === null || subject === undefined || subject.points.length === 0) {
    return (
      <p className="flex h-40 items-center justify-center font-body text-sm text-ink-secondary">
        Nothing has moved yet. This fills in as soon as money does.
      </p>
    );
  }

  const count = subject.points.length;
  const active = hoverIndex === null ? null : subject.points[hoverIndex];

  function trackPointer(event: PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    const share = (event.clientX - box.left) / box.width;
    setHoverIndex(Math.min(count - 1, Math.max(0, Math.round(share * (count - 1)))));
  }

  return (
    <figure className="flex flex-col gap-2" data-testid={testId}>
      {/* Identity never rests on colour alone: each key carries the words as
          well as the mark. */}
      <figcaption className="flex flex-wrap items-center gap-4">
        {series.map((one) => (
          <span key={one.id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-0.5 w-4 rounded-full ${one.role === 'subject' ? 'bg-accent' : 'bg-status-active'}`}
            />
            <span className="font-body text-xs text-ink-secondary">{one.label}</span>
          </span>
        ))}
      </figcaption>

      <div
        className="relative"
        onPointerMove={trackPointer}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${String(viewWidth)} ${String(viewHeight)}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          className="h-40 w-full"
        >
          {/* Recessive on purpose. A grid a reader notices is a grid competing
              with the thing it is there to measure. */}
          {[0, 0.5, 1].map((share) => (
            <line
              key={share}
              x1={0}
              x2={viewWidth}
              y1={share * viewHeight}
              y2={share * viewHeight}
              vectorEffect="non-scaling-stroke"
              className="stroke-edge"
              strokeWidth={1}
            />
          ))}

          {/* The subject gets a fill under it as well as a line. The reference
              does not: two filled areas on one scale read as a stack, which
              would say these add up, and they do not. */}
          <path
            d={`${pathOf(subject.points, bounds)} L${viewWidth} ${viewHeight} L0 ${viewHeight} Z`}
            className={`${fillByRole[subject.role]} opacity-10`}
          />

          {series.map((one) => (
            <path
              key={one.id}
              d={pathOf(one.points, bounds)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={strokeByRole[one.role]}
            />
          ))}

          {active === undefined || active === null ? null : (
            <>
              <line
                x1={xOf(active.atMs, bounds)}
                x2={xOf(active.atMs, bounds)}
                y1={0}
                y2={viewHeight}
                vectorEffect="non-scaling-stroke"
                strokeWidth={1}
                className="stroke-edge-strong"
              />
              {series.map((one) => {
                const point = one.points[hoverIndex ?? 0];
                return point === undefined ? null : (
                  <circle
                    key={one.id}
                    cx={xOf(point.atMs, bounds)}
                    cy={yOf(point.minorUnits, bounds)}
                    r={4}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={2}
                    /* A ring of the surface behind it, so a marker stays
                       legible where the two lines cross. */
                    className={`${fillByRole[one.role]} stroke-surface-raised`}
                  />
                );
              })}
            </>
          )}
        </svg>

        {active === undefined || active === null ? null : (
          <div
            data-testid={testId === undefined ? undefined : `${testId}-tooltip`}
            style={{ left: `${String((xOf(active.atMs, bounds) / viewWidth) * 100)}%` }}
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-edge-strong bg-surface-raised px-2 py-1 shadow-overlay"
          >
            <p className="whitespace-nowrap font-body text-xs text-ink-secondary">
              {formatInstant(new Date(active.atMs).toISOString(), 'date')}
            </p>
            {series.map((one) => {
              const point = one.points[hoverIndex ?? 0];
              return point === undefined ? null : (
                <p key={one.id} className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-body text-xs text-ink-secondary">{one.label}</span>
                  <span className="ml-auto font-figure text-xs tabular-nums text-ink-primary">
                    {formatAmount({ minorUnits: point.minorUnits.toString(), currency })}
                  </span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* The scale, stated rather than implied. This axis does not start at
          zero, which is right for a balance that never goes near it and wrong
          to leave a reader to guess at. */}
      <div className="flex items-baseline justify-between font-body text-xs text-ink-secondary">
        <span className="font-figure tabular-nums">
          {formatAmount({ minorUnits: BigInt(Math.round(bounds.low)).toString(), currency })}
        </span>
        <span>to</span>
        <span className="font-figure tabular-nums">
          {formatAmount({ minorUnits: BigInt(Math.round(bounds.high)).toString(), currency })}
        </span>
      </div>
    </figure>
  );
}
