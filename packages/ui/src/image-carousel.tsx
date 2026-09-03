import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

export interface ImageCarouselProps {
  /* Data URIs or urls, main image first. Empty strings are dropped. */
  readonly images: readonly string[];
  readonly alt: string;
  readonly intervalMs?: number;
  readonly testId?: string;
}

/* One item, several photographs, shown large. It advances on its own so a
   glance takes in every angle without a click, and it yields the moment a
   reader touches it: hovering holds the current frame, the dots and arrows
   move it by hand, and a reader who has asked their system for less motion
   gets no automatic movement at all. A single photograph shows still, with no
   controls to promise a second that is not there. */
export function ImageCarousel({
  images,
  alt,
  intervalMs = 4000,
  testId,
}: ImageCarouselProps): ReactElement | null {
  const shown = images.filter((source) => source.length > 0);
  const count = shown.length;
  const [index, setIndex] = useState(0);
  const [isHeld, setHeld] = useState(false);

  /* Keep the index in range if the set shrinks between renders. */
  const safeIndex = count === 0 ? 0 : index % count;

  useEffect(() => {
    if (count <= 1 || isHeld) {
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      return;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, isHeld, intervalMs]);

  if (count === 0) {
    return null;
  }

  const step = (delta: number): void => setIndex((current) => (current + delta + count) % count);

  return (
    <div
      data-testid={testId}
      className="flex w-full max-w-xs shrink-0 flex-col gap-2"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={alt}
        className="group relative aspect-square w-full overflow-hidden rounded-lg border border-edge bg-surface-sunken"
      >
        <img
          src={shown[safeIndex]}
          alt={count === 1 ? alt : `${alt} (${String(safeIndex + 1)} of ${String(count)})`}
          decoding="async"
          className="h-full w-full object-cover"
        />
        {count > 1 ? (
          <>
            <Arrow direction="left" label="Previous photograph" onClick={() => step(-1)} />
            <Arrow direction="right" label="Next photograph" onClick={() => step(1)} />
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {shown.map((source, dot) => (
            <button
              key={source.slice(0, 24) + String(dot)}
              type="button"
              aria-label={`Show photograph ${String(dot + 1)}`}
              aria-current={dot === safeIndex ? 'true' : undefined}
              onClick={() => setIndex(dot)}
              className={`h-1.5 rounded-full transition-all duration-control ease-enter focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active ${
                dot === safeIndex
                  ? 'w-4 bg-ink-primary'
                  : 'w-1.5 bg-edge-strong hover:bg-ink-secondary'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Arrow({
  direction,
  label,
  onClick,
}: {
  readonly direction: 'left' | 'right';
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-surface-raised/90 text-ink-primary opacity-0 transition-opacity duration-control ease-enter group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        direction === 'left' ? 'left-2' : 'right-2'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4"
      >
        {direction === 'left' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
