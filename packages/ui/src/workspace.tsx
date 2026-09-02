import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface WorkspaceProps {
  readonly indexStrip?: ReactNode;
  readonly browse: ReactNode;
  readonly detail: ReactNode;
  readonly spine?: ReactNode;
  readonly tape?: ReactNode;
  /* Remembered per reader. A rail somebody widened once should still be wide
     tomorrow, so this is a preference in local storage rather than a
     selection in the URL. */
  readonly storageKey?: string;
}

/* Wide enough for two gallery tiles that still show what the thing is. Below
   this the rail was draggable down to a column of thumbnails with the
   descriptions clipped to nothing, which is narrower than any reader wants
   and narrower than the gallery can lay out. */
const minimumWidth = 360;
const maximumWidth = 720;
const defaultWidth = 440;

function readStoredWidth(key: string): number {
  if (typeof localStorage === 'undefined') {
    return defaultWidth;
  }
  const stored = Number(localStorage.getItem(key));
  if (!Number.isFinite(stored) || stored <= 0) {
    return defaultWidth;
  }
  return Math.min(Math.max(stored, minimumWidth), maximumWidth);
}

/* Two panes, collateral on the left and the market on the right, with the
   index above and the spine and tape below.

   Below the large breakpoint the panes stack rather than shrink: two columns
   of a dense book on a narrow screen is two columns of nothing legible. The
   workspace is a desktop instrument and says so by degrading to a single
   column rather than by pretending. */
export function Workspace({
  indexStrip,
  browse,
  detail,
  spine,
  tape,
  storageKey = 'depawn.workspace.browseWidth',
}: WorkspaceProps): ReactElement {
  const [width, setWidth] = useState(defaultWidth);
  /* Dragging is followed frame by frame, so the width must not be animated
     while it happens: a transition on a value that changes every pointer
     move lags behind the cursor and reads as the pane fighting back. A step
     from the keyboard or a restored width is animated, because those change
     it all at once. */
  const [isDragging, setDragging] = useState(false);
  const dragging = useRef(false);
  const frame = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWidth(readStoredWidth(storageKey));
  }, [storageKey]);

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, minimumWidth), maximumWidth);
      setWidth(clamped);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, String(clamped));
      }
    },
    [storageKey],
  );

  useEffect(() => {
    function onMove(event: PointerEvent): void {
      if (!dragging.current || frame.current === null) {
        return;
      }
      commit(event.clientX - frame.current.getBoundingClientRect().left);
    }
    function onUp(): void {
      dragging.current = false;
      setDragging(false);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [commit]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-base">
      {indexStrip}
      <div ref={frame} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Live listings"
          style={{ width: `${String(width)}px` }}
          className={`flex min-h-0 w-full shrink-0 flex-col overflow-y-auto border-edge max-lg:!w-full lg:border-r ${
            isDragging ? '' : 'lg:transition-[width] lg:duration-control lg:ease-enter'
          }`}
        >
          {browse}
        </section>

        {/* A real separator rather than a mouse only handle: somebody working
            from the keyboard can widen this too. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the listings pane"
          aria-valuenow={width}
          aria-valuemin={minimumWidth}
          aria-valuemax={maximumWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            dragging.current = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              commit(width - 24);
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              commit(width + 24);
            }
          }}
          className="hidden w-1 shrink-0 cursor-col-resize bg-edge transition-colors duration-control ease-enter hover:bg-edge-strong focus-visible:bg-status-active focus-visible:outline-none lg:block"
        />

        <section aria-label="Selected listing" className="min-h-0 flex-1 overflow-y-auto">
          {detail}
        </section>
      </div>
      {spine}
      {tape}
    </div>
  );
}

export interface WorkspaceEmptyProps {
  readonly title: string;
  readonly description: string;
}

/* The detail pane with nothing selected. A prompt rather than a spinner:
   nothing is loading, the reader simply has not chosen yet, and a spinner
   would claim otherwise. */
export function WorkspacePrompt({ title, description }: WorkspaceEmptyProps): ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-heading text-base font-semibold text-ink-primary">{title}</p>
      <p className="max-w-md font-body text-sm text-ink-secondary">{description}</p>
    </div>
  );
}
