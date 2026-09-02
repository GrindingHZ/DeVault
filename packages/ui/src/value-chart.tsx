import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /* How the line travels between two samples. `linear` joins them straight;
     `smooth` curves through them.

     The curve is monotone (Fritsch and Carlson), not a plain spline, and the
     difference matters here: a plain spline overshoots around a turn, so a
     balance that never fell would be drawn dipping below a figure the account
     never held. A monotone curve stays inside the two samples it joins, so
     the shape is easier to read and still cannot claim anything untrue. */
  readonly shape?: 'linear' | 'smooth';
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
  /* Names the marked instant on the plot, so a line standing there does not
     leave a reader guessing which instant it is standing for. */
  readonly markedLabel?: string | undefined;
  /* Where the figures under the pointer are read. `tooltip` is this chart's
     own readout. `external` means the caller is showing them somewhere
     better, usually by updating figures it was already displaying, and two
     readouts of the same number would only compete. */
  readonly readout?: 'tooltip' | 'external';
  /* The instant under the pointer, or null when it leaves. */
  readonly onHoverChange?: (atMs: number | null) => void;
  /* Anything the caller wants read out beside the series values, worked out
     for the instant under the pointer. The chart owns how a row looks; the
     caller owns what the figure means, because only it knows. */
  readonly extraReadoutFor?: (atMs: number) => readonly ValueReadoutRow[];
  readonly testId?: string | undefined;
}

export interface ValueReadoutRow {
  readonly label: string;
  readonly value: string;
  /* Money the reader gains or loses, or neither. Tone is the only thing the
     chart decides from this; the words are the caller's. */
  readonly tone?: 'neutral' | 'favourable' | 'adverse';
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

/* Reading an array without asserting it is populated, so the smoothing below
   can index its neighbours without a non-null assertion in production code. */
function at(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/* Tangents that cannot overshoot: zero wherever the samples turn, averaged
   where they do not, then limited to three times the local slope, which is
   the Fritsch and Carlson condition for staying monotone. */
function monotoneTangents(xs: readonly number[], ys: readonly number[]): readonly number[] {
  const count = xs.length;
  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const run = at(xs, index + 1) - at(xs, index);
    slopes.push(run === 0 ? 0 : (at(ys, index + 1) - at(ys, index)) / run);
  }

  const tangents: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index === 0 || index === count - 1) {
      tangents.push(at(slopes, index === 0 ? 0 : count - 2));
      continue;
    }
    const before = at(slopes, index - 1);
    const after = at(slopes, index);
    tangents.push(before * after <= 0 ? 0 : (before + after) / 2);
  }

  for (let index = 0; index < count - 1; index += 1) {
    const slope = at(slopes, index);
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const from = at(tangents, index) / slope;
    const to = at(tangents, index + 1) / slope;
    const distance = from * from + to * to;
    if (distance > 9) {
      const limit = 3 / Math.sqrt(distance);
      tangents[index] = limit * from * slope;
      tangents[index + 1] = limit * to * slope;
    }
  }
  return tangents;
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
  markedLabel,
  readout = 'tooltip',
  onHoverChange,
  extraReadoutFor,
  testId,
}: ValueChartProps): ReactElement {
  const [plotRef, measuredWidth] = useMeasuredWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /* The readout follows the pointer, so it has to know how wide it is to
     stay inside the plot. Measured after it renders rather than guessed:
     the figures in it change width as the reader moves along the line. */
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const [readoutWidth, setReadoutWidth] = useState(0);

  useLayoutEffect(() => {
    const element = readoutRef.current;
    if (element === null) {
      return;
    }
    const measured = element.getBoundingClientRect().width;
    if (measured !== readoutWidth) {
      setReadoutWidth(measured);
    }
  });

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

  function pathOf(points: readonly ValuePoint[], shape: ValueSeries['shape']): string {
    const xs = points.map((point) => xOf(point.atMs));
    const ys = points.map((point) => yOf(point.minorUnits));
    const opening = `M${at(xs, 0).toFixed(1)} ${at(ys, 0).toFixed(1)}`;

    if (shape !== 'smooth' || points.length < 3) {
      return points
        .map((point, index) =>
          index === 0 ? opening : `L${at(xs, index).toFixed(1)} ${at(ys, index).toFixed(1)}`,
        )
        .join(' ');
    }

    /* A cubic through every sample, its control points a third of the way
       along and leaning at the limited tangent, which is what keeps the
       curve inside the pair it joins. */
    const tangents = monotoneTangents(xs, ys);
    const curves = points.slice(1).map((_point, index) => {
      const reach = (at(xs, index + 1) - at(xs, index)) / 3;
      const fromX = (at(xs, index) + reach).toFixed(1);
      const fromY = (at(ys, index) + at(tangents, index) * reach).toFixed(1);
      const toX = (at(xs, index + 1) - reach).toFixed(1);
      const toY = (at(ys, index + 1) - at(tangents, index + 1) * reach).toFixed(1);
      return `C${fromX} ${fromY}, ${toX} ${toY}, ${at(xs, index + 1).toFixed(1)} ${at(ys, index + 1).toFixed(1)}`;
    });
    return [opening, ...curves].join(' ');
  }

  function trackPointer(event: PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    const share = (event.clientX - box.left) / box.width;
    const index = Math.min(count - 1, Math.max(0, Math.round(share * (count - 1))));
    setHoverIndex(index);
    onHoverChange?.(subject?.points[index]?.atMs ?? null);
  }

  function releasePointer(): void {
    setHoverIndex(null);
    onHoverChange?.(null);
  }

  const money = (minorUnits: bigint): string =>
    formatAmount({ minorUnits: minorUnits.toString(), currency });

  /* The readout travels with the pointer, centred on the day being read, and
     clamped to the plot so it cannot hang off either end. It was pinned to
     the far edge before, which never overflowed but made a reader look away
     from the line to find the figures for the point under their finger. */
  const anchor = active === null ? 0 : xOf(active.atMs);
  const readoutLeft = Math.min(
    Math.max(anchor - readoutWidth / 2, 0),
    Math.max(0, width - readoutWidth),
  );

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
          onPointerLeave={releasePointer}
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
              d={`${pathOf(subject.points, subject.shape)} L${String(width)} ${String(plotHeight)} L0 ${String(plotHeight)} Z`}
              className={`${fillByRole[subject.role]} opacity-10`}
            />

            {series.map((one) => (
              <path
                key={one.id}
                d={pathOf(one.points, one.shape)}
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
                {/* Dashed, so it reads as an annotation rather than as a
                    third series, and quieter than the hover crosshair: this
                    one is always there. */}
                <line
                  data-marked-line="true"
                  x1={xOf(markedAtMs)}
                  x2={xOf(markedAtMs)}
                  y1={markedLabel === undefined ? 0 : 12}
                  y2={plotHeight}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="stroke-edge-strong"
                />
                {markedLabel === undefined ? null : (
                  <text
                    data-testid={testId === undefined ? undefined : `${testId}-marked-label`}
                    x={xOf(markedAtMs)}
                    y={8}
                    /* Turned in at the ends so the word cannot hang off the
                       plot on a position that opened or matures at the edge
                       of the window being drawn. */
                    textAnchor={
                      xOf(markedAtMs) < 24
                        ? 'start'
                        : xOf(markedAtMs) > width - 24
                          ? 'end'
                          : 'middle'
                    }
                    fontSize={10}
                    className="fill-ink-secondary font-body"
                  >
                    {markedLabel}
                  </text>
                )}
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

          {active === null || readout === 'external' ? null : (
            <div
              ref={readoutRef}
              data-testid={testId === undefined ? undefined : `${testId}-tooltip`}
              style={{ left: readoutLeft }}
              className="pointer-events-none absolute top-1 w-max max-w-full rounded-md border border-edge-strong bg-surface-raised px-2 py-1 shadow-overlay"
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
              {(extraReadoutFor?.(active.atMs) ?? []).map((row) => (
                <p
                  key={row.label}
                  className="flex items-baseline gap-3 whitespace-nowrap border-t border-edge pt-1 first-of-type:border-t-0"
                >
                  <span className="font-body text-xs text-ink-secondary">{row.label}</span>
                  <span
                    className={`ml-auto font-figure text-xs font-semibold tabular-nums ${
                      row.tone === 'favourable'
                        ? 'text-market-favourable'
                        : row.tone === 'adverse'
                          ? 'text-market-adverse'
                          : 'text-ink-primary'
                    }`}
                  >
                    {row.value}
                  </span>
                </p>
              ))}
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
