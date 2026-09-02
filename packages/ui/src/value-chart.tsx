import { useEffect, useRef, useState } from 'react';
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
     the dark floor surface. The reference is also dashed, which is what
     keeps the two apart where they hold the same value and one would
     otherwise sit invisibly underneath the other. */
  readonly role: 'subject' | 'reference';
  readonly points: readonly ValuePoint[];
}

export interface ValueChartProps {
  readonly series: readonly ValueSeries[];
  readonly currency: string;
  /* Names the whole chart for a screen reader, which cannot read a shape. */
  readonly label: string;
  /* Pins a persistent marker at this instant, the way the positions page
     marks where a loan stands today. Markers land only on series points
     that sit exactly at the instant; the chart never interpolates a value,
     because a drawn figure nobody priced would be the chart pricing it. */
  readonly markedAtMs?: number | undefined;
  readonly testId?: string | undefined;
}

const plotHeight = 160;

/* Only used before the first measurement, and by jsdom, which has no layout.
   A real width arrives on the first frame. */
const assumedWidth = 600;

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

/* Measures the box the plot is given, so the drawing can be done in real
   pixels rather than in an abstract grid stretched to fit.

   That distinction is the whole reason this hook exists. A viewBox scaled
   with `preserveAspectRatio="none"` stretches each axis by a different
   factor, and everything that is not a straight line comes out deformed: a
   four pixel marker on a 100 by 34 grid stretched to 1215 by 160 rendered 97
   pixels wide and 38 tall, which reads as a blob sitting on the line rather
   than as a point on it. */
function useMeasuredWidth(): readonly [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined) {
        setWidth(measured);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/* How a value moved, drawn as a line per series over one shared scale.

   One axis, always. Two measures at different scales get two charts rather
   than a second y-axis, which is the single most common way a chart like
   this starts lying. */
export function ValueChart({
  series,
  currency,
  label,
  markedAtMs,
  testId,
}: ValueChartProps): ReactElement {
  const [plotRef, measuredWidth] = useMeasuredWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = measuredWidth > 0 ? measuredWidth : assumedWidth;
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
  const active = hoverIndex === null ? null : (subject.points[hoverIndex] ?? null);

  function xOf(atMs: number): number {
    const span = bounds === null ? 0 : bounds.to - bounds.from;
    return span <= 0 || bounds === null ? width / 2 : ((atMs - bounds.from) / span) * width;
  }

  function yOf(minorUnits: bigint): number {
    const span = bounds === null ? 0 : bounds.high - bounds.low;
    return span <= 0 || bounds === null
      ? plotHeight / 2
      : plotHeight - ((Number(minorUnits) - bounds.low) / span) * plotHeight;
  }

  function pathOf(points: readonly ValuePoint[]): string {
    return points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${xOf(point.atMs).toFixed(1)} ${yOf(point.minorUnits).toFixed(1)}`,
      )
      .join(' ');
  }

  function trackPointer(event: PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    const share = (event.clientX - box.left) / box.width;
    setHoverIndex(Math.min(count - 1, Math.max(0, Math.round(share * (count - 1)))));
  }

  const money = (minorUnits: bigint): string =>
    formatAmount({ minorUnits: minorUnits.toString(), currency });

  /* Pinned to the far edge rather than centred on the point. Centring means
     the readout hangs half its own width off whichever end the pointer is
     near, and clamping that needs a width nobody has measured yet. Sending
     it to the opposite side cannot overflow at any size, and it keeps the
     readout away from the part of the line being read. */
  const isPointerLeftOfCentre = active !== null && xOf(active.atMs) < width / 2;

  return (
    <figure className="flex flex-col gap-3" data-testid={testId}>
      {/* Identity never rests on colour alone: each key carries the words and
          the same dash the line is drawn with. */}
      <figcaption className="flex flex-wrap items-center gap-4">
        {series.map((one) => (
          <span key={one.id} className="flex items-center gap-1.5">
            <svg aria-hidden="true" width={16} height={2} className="overflow-visible">
              <line
                x1={0}
                x2={16}
                y1={1}
                y2={1}
                strokeWidth={2}
                strokeDasharray={one.role === 'reference' ? '4 3' : undefined}
                className={strokeByRole[one.role]}
              />
            </svg>
            <span className="font-body text-xs text-ink-secondary">{one.label}</span>
          </span>
        ))}
      </figcaption>

      <div className="flex gap-2">
        {/* The scale, stated up the side where a scale belongs. Laid along the
            bottom it read as an x-axis and said nothing true about time. */}
        <div
          aria-hidden="true"
          className="hidden w-16 shrink-0 flex-col justify-between py-0.5 text-right font-figure text-xs tabular-nums text-ink-secondary sm:flex"
          style={{ height: plotHeight }}
        >
          <span>{money(BigInt(Math.round(bounds.high)))}</span>
          <span>{money(BigInt(Math.round(bounds.low)))}</span>
        </div>

        <div
          ref={plotRef}
          className="relative min-w-0 flex-1"
          onPointerMove={trackPointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* The viewBox matches the pixel box exactly, so nothing is scaled
              and a circle stays a circle. */}
          <svg
            viewBox={`0 0 ${String(width)} ${String(plotHeight)}`}
            width="100%"
            height={plotHeight}
            role="img"
            aria-label={label}
            className="block overflow-visible"
          >
            {/* Recessive on purpose. A grid a reader notices is a grid
                competing with the thing it is there to measure. */}
            {[0, 0.5, 1].map((share) => (
              <line
                key={share}
                x1={0}
                x2={width}
                y1={share * plotHeight}
                y2={share * plotHeight}
                strokeWidth={1}
                className="stroke-edge"
              />
            ))}

            {/* The subject gets a fill under it as well as a line. The
                reference does not: two filled areas on one scale read as a
                stack, which would say these add up, and they do not. */}
            <path
              d={`${pathOf(subject.points)} L${String(width)} ${String(plotHeight)} L0 ${String(plotHeight)} Z`}
              className={`${fillByRole[subject.role]} opacity-10`}
            />

            {series.map((one) => (
              <path
                key={one.id}
                d={pathOf(one.points)}
                fill="none"
                strokeWidth={2}
                strokeDasharray={one.role === 'reference' ? '4 3' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={strokeByRole[one.role]}
              />
            ))}

            {markedAtMs === undefined ? null : (
              <>
                {/* Quieter than the hover crosshair on purpose: this one is
                    always there, so it has to sit behind the reading rather
                    than compete with it. */}
                <line
                  data-marked-line="true"
                  x1={xOf(markedAtMs)}
                  x2={xOf(markedAtMs)}
                  y1={0}
                  y2={plotHeight}
                  strokeWidth={1}
                  className="stroke-edge"
                />
                {series.map((one) => {
                  const point = one.points.find((candidate) => candidate.atMs === markedAtMs);
                  return point === undefined ? null : (
                    <circle
                      key={`marked-${one.id}`}
                      data-marked="true"
                      cx={xOf(point.atMs)}
                      cy={yOf(point.minorUnits)}
                      r={4}
                      strokeWidth={2}
                      className={`${fillByRole[one.role]} stroke-surface-raised`}
                    />
                  );
                })}
              </>
            )}

            {active === null ? null : (
              <>
                <line
                  x1={xOf(active.atMs)}
                  x2={xOf(active.atMs)}
                  y1={0}
                  y2={plotHeight}
                  strokeWidth={1}
                  className="stroke-edge-strong"
                />
                {series.map((one) => {
                  const point = one.points[hoverIndex ?? 0];
                  return point === undefined ? null : (
                    <circle
                      key={one.id}
                      cx={xOf(point.atMs)}
                      cy={yOf(point.minorUnits)}
                      r={4}
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

          {active === null ? null : (
            <div
              data-testid={testId === undefined ? undefined : `${testId}-tooltip`}
              data-side={isPointerLeftOfCentre ? 'right' : 'left'}
              className={`pointer-events-none absolute top-1 max-w-full rounded-md border border-edge-strong bg-surface-raised px-2 py-1 shadow-overlay ${
                isPointerLeftOfCentre ? 'right-0' : 'left-0'
              }`}
            >
              <p className="whitespace-nowrap font-body text-xs text-ink-secondary">
                {formatInstant(new Date(active.atMs).toISOString(), 'date')}
              </p>
              {series.map((one) => {
                const point = one.points[hoverIndex ?? 0];
                return point === undefined ? null : (
                  <p key={one.id} className="flex items-baseline gap-3 whitespace-nowrap">
                    <span className="font-body text-xs text-ink-secondary">{one.label}</span>
                    <span className="ml-auto font-figure text-xs tabular-nums text-ink-primary">
                      {money(point.minorUnits)}
                    </span>
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* When the window opened and where it ends, under the plot it
          describes rather than under the whole figure. */}
      <div className="flex justify-between font-body text-xs text-ink-secondary sm:pl-[4.5rem]">
        <span>{formatInstant(new Date(bounds.from).toISOString(), 'date')}</span>
        <span>{formatInstant(new Date(bounds.to).toISOString(), 'date')}</span>
      </div>

      {/* The scale again, for the narrow screen that has no room for a gutter
          beside the plot. A phone gets the whole width for the line and the
          range in words underneath. */}
      <p className="font-body text-xs text-ink-secondary sm:hidden">
        <span className="font-figure tabular-nums">{money(BigInt(Math.round(bounds.low)))}</span> to{' '}
        <span className="font-figure tabular-nums">{money(BigInt(Math.round(bounds.high)))}</span>
      </p>
    </figure>
  );
}
