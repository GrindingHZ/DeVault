import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { StatusBadge } from './status-badge';
import type { StatusTone } from './status-badge';

export interface LegendEntry {
  readonly label: string;
  readonly tone: StatusTone;
  readonly meaning: string;
}

export interface LegendProps {
  /* The noun the column holds, singular and lower case in the middle of a
     sentence: "status" becomes "What each status means". Passing a whole
     phrase here produced "What every what each status means means". */
  readonly noun: string;
  readonly entries: readonly LegendEntry[];
  readonly testId: string;
}

const panelWidth = 320;
const gutter = 12;

/* Every value a status column can take, and what each one means.

   Opens on click rather than hover, for the same reason `Explain` does: hover
   has no touch equivalent and no keyboard equivalent, so a hover panel is a
   feature only some people get.

   The entries come from wherever the statuses are defined, never from a copy
   written here. A legend that has fallen behind the code is worse than no
   legend, because it tells the reader they have seen all of them.

   The panel is rendered into the document rather than beside its trigger.
   Its natural home is a table header, and a wide table lives inside an
   `overflow-x-auto` container, which clipped the panel and gave it a
   scrollbar of its own. Nothing positioned inside that container can escape
   it, so the panel leaves and is placed against the trigger by hand. */
export function Legend({ noun, entries, testId }: LegendProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, maxHeight: 0 });
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const heading = `What each ${noun} means`;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    /* Right aligned to the trigger, then pulled back inside the viewport.
       The status column sits near the end of a wide table, so a left
       aligned panel would hang off the edge of the screen. */
    const left = Math.min(
      Math.max(gutter, rect.right - panelWidth),
      Math.max(gutter, window.innerWidth - panelWidth - gutter),
    );
    /* Below the trigger by default, above it when there is more room there.
       A table header near the fold left the panel with a few visible lines
       and the rest behind the bottom of the window. */
    const below = window.innerHeight - rect.bottom - gutter * 2;
    const above = rect.top - gutter * 2;
    if (below < 240 && above > below) {
      setAnchor({ top: Math.max(gutter, rect.top - 8 - above), left, maxHeight: above });
      return;
    }
    setAnchor({ top: rect.bottom + 8, left, maxHeight: Math.max(160, below) });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      place();
    }
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
        // Focus goes back where it came from, or the reader is stranded.
        triggerRef.current?.focus();
      }
    }
    /* Capture, so a scroll of the table the trigger sits in counts and not
       only a scroll of the window. */
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [isOpen, place]);

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label={heading}
      data-testid={`${testId}-panel`}
      style={{
        top: anchor.top,
        left: anchor.left,
        width: panelWidth,
        maxHeight: anchor.maxHeight,
      }}
      className={[
        'fixed z-50 rounded-lg border border-edge bg-surface-raised p-4 text-left shadow-overlay',
        'overflow-y-auto max-w-[calc(100vw-1.5rem)]',
      ].join(' ')}
    >
      <p className="mb-3 font-body text-sm font-semibold text-ink-primary">{heading}</p>
      <dl className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-1">
            <dt>
              <StatusBadge tone={entry.tone} label={entry.label} />
            </dt>
            <dd className="font-body text-sm leading-relaxed text-ink-secondary">
              {entry.meaning}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <span ref={containerRef} className="inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={heading}
        onClick={() => setIsOpen((open) => !open)}
        className={[
          'ml-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center',
          'rounded-full border font-body text-[10px] font-semibold italic leading-none',
          'transition-colors duration-control ease-enter',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
          isOpen
            ? 'border-accent bg-surface-sunken text-accent'
            : 'border-edge text-ink-secondary hover:border-accent hover:text-accent',
        ].join(' ')}
      >
        i
      </button>
      {isOpen ? createPortal(panel, document.body) : null}
    </span>
  );
}
