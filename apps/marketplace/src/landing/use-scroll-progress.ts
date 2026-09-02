import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/* One ticker for the whole page.

   Every scrubbed section on the landing page is a pure function of where its
   own box sits against the viewport, so none of them needs its own listener.
   A scroll event fires more often than a frame and a dozen of them each
   calling getBoundingClientRect is how a marketing page ends up janky, so
   subscribers share a single requestAnimationFrame loop that runs only while
   somebody is subscribed. */
type Subscriber = () => void;

const subscribers = new Set<Subscriber>();
let frame: number | null = null;

function tick(): void {
  for (const subscriber of subscribers) {
    subscriber();
  }
  frame = requestAnimationFrame(tick);
}

function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  if (frame === null) {
    frame = requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

/* Rounded before it reaches state, so React re-renders on a step the eye can
   see rather than on every frame of a scroll. Two hundred steps is finer than
   any of the thresholds this page reads against. */
const steps = 200;

function quantise(value: number): number {
  return Math.round(value * steps) / steps;
}

/* How far the element has travelled through its own scroll range, 0 before it
   starts and 1 once its bottom reaches the bottom of the viewport. Sections
   built for this are taller than the viewport and pin something inside
   themselves, which is what gives the number somewhere to run. */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    function read(): void {
      const element = ref.current;
      if (element === null) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const next = travel <= 0 ? 0 : quantise(Math.min(Math.max(-rect.top / travel, 0), 1));
      if (next !== latest.current) {
        latest.current = next;
        setProgress(next);
      }
    }
    read();
    return subscribe(read);
  }, [ref]);

  return progress;
}

/* How far a normal height section has risen through the viewport: 0 as its
   top reaches the bottom of the screen, 1 once it has travelled most of the
   way up.

   `useScrollProgress` needs a section taller than the viewport to have
   anything to measure. A section that is simply read, rather than pinned and
   scrubbed, still wants something to animate against, and this gives it one
   without inflating the page by several screens to get it. */
export function useEnterProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    function read(): void {
      const element = ref.current;
      if (element === null) {
        return;
      }
      const rect = element.getBoundingClientRect();
      /* Measured against the section's own height, not a fixed slice of the
         viewport. A fixed slice finished the animation the moment the section
         arrived, so by the time a reader was actually looking at a tall
         section everything in it had already played and it read as static.
         Zero when the top is near the bottom of the screen, one once the
         section has most of the way past. */
      const start = window.innerHeight * 0.85;
      /* Four fifths of the section rather than all of it. The last section on
         the page can never scroll fully past, because the page stops when its
         bottom reaches the bottom of the window, so a travel measured over
         the whole height leaves its animation stranded short of finishing. */
      const travel = rect.height * 0.8 + window.innerHeight * 0.2;
      const next = quantise(Math.min(Math.max((start - rect.top) / travel, 0), 1));
      if (next !== latest.current) {
        latest.current = next;
        setProgress(next);
      }
    }
    read();
    return subscribe(read);
  }, [ref]);

  return progress;
}

/* How far one element has risen through the viewport, on its own account:
   zero as its top crosses the bottom edge, one once it has climbed a little
   past the middle.

   A section wide progress cannot drive a row that is a thousand pixels down
   the section. By the time the section has arrived, the number is spent, and
   every row in it is already at its end state before the reader reaches any
   of them. Each row measures itself instead, so it fills as it comes into
   view and the stagger comes from the scrolling rather than from an offset
   somebody had to guess. */
export function useViewportProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    function read(): void {
      const element = ref.current;
      if (element === null) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      /* Starts as the row clears the bottom edge and finishes only once it is
         near the top, so it fills across most of a screen of scrolling rather
         than in the last stretch before the reader arrives.

         The first pass ran over 45 percent of the viewport and was done by
         the time a row reached the middle, which meant every row a reader
         actually looked at was already full and the whole thing read as
         static. */
      const start = viewport * 0.95;
      const travel = viewport * 0.8;
      const next = quantise(Math.min(Math.max((start - rect.top) / travel, 0), 1));
      if (next !== latest.current) {
        latest.current = next;
        setProgress(next);
      }
    }
    read();
    return subscribe(read);
  }, [ref]);

  return progress;
}

/* Whether the reader has left the hero, as a fraction of the viewport. The
   nav is the only thing that asks, and it asks on the same ticker as
   everything else rather than adding a scroll listener of its own. */
export function useScrolledPast(viewportFraction: number): boolean {
  const [past, setPast] = useState(false);
  const latest = useRef(false);

  useEffect(() => {
    function read(): void {
      const next = window.scrollY > window.innerHeight * viewportFraction;
      if (next !== latest.current) {
        latest.current = next;
        setPast(next);
      }
    }
    read();
    return subscribe(read);
  }, [viewportFraction]);

  return past;
}

/* True once the element has been in view at all. Used for the reveals that
   play once rather than tracking scroll, so nothing animates back out as a
   reader scrolls up past it. */
export function useHasEntered(ref: RefObject<HTMLElement | null>, threshold = 0.2): boolean {
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null || hasEntered) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEntered(true);
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, hasEntered, threshold]);

  return hasEntered;
}

/* Whether the element is on screen enough to be worth animating. The order
   book runs on a timer and a timer that keeps running for a section nobody is
   looking at is a battery drain and a surprise: a reader who scrolls back
   finds the book somewhere they did not leave it. */
export function useIsInView(ref: RefObject<HTMLElement | null>, threshold = 0.3): boolean {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setIsInView(entries.some((entry) => entry.isIntersecting)),
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return isInView;
}

/* Somebody who asked their system not to animate things has asked for a
   reason. Every scrubbed section still tracks scroll, because that is
   navigation rather than decoration, but the timed ones jump to their end
   state and stay there. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
