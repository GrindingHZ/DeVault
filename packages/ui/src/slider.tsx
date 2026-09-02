import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface SliderMarker {
  readonly value: number;
  readonly label: string;
}

/* The optionals are spelled with `undefined` because the package compiles
   under `exactOptionalPropertyTypes`, where leaving a prop out and passing
   undefined are different types. A caller computing a marker from a book
   that may be empty passes the second. */
export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number | undefined;
  readonly onValueChange: (value: number) => void;
  /* What the number means, said the way a reader would say it. A screen
     reader announcing "one thousand eight hundred" for a rate of 18% is
     reading the storage format aloud. */
  readonly valueText: (value: number) => string;
  /* Sits on the right of the label row, for the box that shows the same
     figure in a form a reader can type into. */
  readonly valueControl?: ReactNode | undefined;
  /* One reference point drawn on the track. On a rate slider this is the
     offer to beat, which is the only number on the scale a lender is
     actually aiming at. */
  readonly marker?: SliderMarker | undefined;
  readonly testId?: string | undefined;
}

function shareOf(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  const clamped = Math.min(Math.max(value, min), max);
  return ((clamped - min) / (max - min)) * 100;
}

/* The track, the fill and the marker are drawn as elements behind a range
   input whose own track is transparent. Styling the native track through its
   vendor pseudo elements cannot express a fill that stops at the value, and
   cannot carry a marker at all.

   The input keeps every behaviour that matters: arrow keys, Home and End,
   Page Up and Page Down, the drag, and the role and value a screen reader
   reads. Only the paint is ours. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  valueText,
  valueControl,
  marker,
  testId,
}: SliderProps): ReactElement {
  const labelId = useId();
  const filled = shareOf(value, min, max);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <label id={labelId} className="font-body text-sm text-ink-secondary">
          {label}
        </label>
        {valueControl}
      </div>

      <div className="relative flex h-4 items-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-2 rounded-full border border-edge bg-surface-sunken"
        />
        <span
          aria-hidden="true"
          style={{ '--filled': `${String(filled)}%` } as CSSProperties}
          className="pointer-events-none absolute left-0 h-2 w-[var(--filled)] rounded-full bg-accent"
        />
        {marker === undefined ? null : (
          <span
            aria-hidden="true"
            style={{ '--at': `${String(shareOf(marker.value, min, max))}%` } as CSSProperties}
            className="pointer-events-none absolute left-[var(--at)] h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink-primary"
          />
        )}

        <input
          type="range"
          data-testid={testId}
          aria-labelledby={labelId}
          aria-valuetext={valueText(value)}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onValueChange(Number(event.target.value))}
          className={[
            'relative w-full cursor-pointer appearance-none bg-transparent',
            'focus:outline-none',

            /* The native track is given the height the thumb is centred
               against and nothing else. What a reader sees is painted
               above. */
            '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent',

            /* Sixteen pixels of thumb centred on eight pixels of track is a
               four pixel lift, which is the whole reason those two numbers
               are what they are. A ring of page colour around it keeps the
               thumb legible where it crosses the fill. */
            '[&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-raised',
            '[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-raised',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-raised',
            '[&::-moz-range-thumb]:bg-accent',

            /* The ring goes on the thumb rather than on the input, because
               an outline around the whole control would sit a long way from
               the thing the keyboard is actually moving. */
            '[&:focus-visible::-webkit-slider-thumb]:outline',
            '[&:focus-visible::-webkit-slider-thumb]:outline-2',
            '[&:focus-visible::-webkit-slider-thumb]:outline-offset-2',
            '[&:focus-visible::-webkit-slider-thumb]:outline-status-active',
            '[&:focus-visible::-moz-range-thumb]:outline',
            '[&:focus-visible::-moz-range-thumb]:outline-2',
            '[&:focus-visible::-moz-range-thumb]:outline-offset-2',
            '[&:focus-visible::-moz-range-thumb]:outline-status-active',
          ].join(' ')}
        />
      </div>

      {/* The ends of the scale, and the one point on it worth aiming at. */}
      <div className="flex items-baseline justify-between gap-2 font-body text-xs text-ink-secondary">
        <span className="font-figure tabular-nums">{valueText(min)}</span>
        {marker === undefined ? null : (
          <span className="font-body text-ink-primary">
            {marker.label}{' '}
            <span className="font-figure tabular-nums">{valueText(marker.value)}</span>
          </span>
        )}
        <span className="font-figure tabular-nums">{valueText(max)}</span>
      </div>
    </div>
  );
}
