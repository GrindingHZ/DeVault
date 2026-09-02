import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement, ReactNode } from 'react';

export interface PopoverProps {
  /* The accessible name of the trigger, and the name of the panel it opens.
     Written as a phrase a screen reader can announce on its own. */
  readonly label: string;
  readonly testId: string;
  /* What the trigger looks like. The button element around it belongs to
     this component, so every popover in the product opens the same way. */
  readonly trigger: ReactNode;
  readonly triggerClassName: string;
  readonly children: ReactNode;
  readonly width?: number;
  /* Where the panel lines up with the trigger. Right for anything near the
     end of a row, which is most of them. */
  readonly align?: 'left' | 'right';
  /* Whether acting inside the panel closes it. True for a menu, where every
     row is a command. False for a panel that is only there to be read: a
     definition closing itself because somebody dragged across a word is a
     panel fighting the reader. */
  readonly closesOnAction?: boolean;
}

const gutter = 12;

/* One popover, opened by a button, for every menu and panel in the product.

   Opens on click rather than hover: hover has no touch equivalent and no
   keyboard equivalent, so a hover panel is a feature only some people get.

   The panel is rendered into the document rather than beside its trigger. A
   header sits in a row with `overflow` on it and a table header sits inside
   an `overflow-x-auto` container, and both clipped the panel to a sliver
   with a scrollbar of its own. Nothing positioned inside those containers
   can escape them, so the panel leaves and is placed against the trigger by
   hand. */
export function Popover({
  label,
  testId,
  trigger,
  triggerClassName,
  children,
  width = 320,
  align = 'right',
  closesOnAction = true,
}: PopoverProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, maxHeight: 0 });
  /* The palette scope the trigger sits in, carried onto the panel.

     The panel is portaled to the document body, which is outside the element
     carrying `data-surface`, so the marketplace floor's dark tokens stopped
     applying and every panel opened white on a dark screen. Copying the
     attribute puts the panel back inside the scope it belongs to without
     giving up the portal. */
  const [surface, setSurface] = useState<string | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const place = useCallback(() => {
    const element = triggerRef.current;
    if (element === null) {
      return;
    }
    setSurface(element.closest('[data-surface]')?.getAttribute('data-surface') ?? null);
    const rect = element.getBoundingClientRect();
    const preferred = align === 'right' ? rect.right - width : rect.left;
    /* Pulled back inside the viewport whichever edge it was aligned to. */
    const left = Math.min(
      Math.max(gutter, preferred),
      Math.max(gutter, window.innerWidth - width - gutter),
    );
    /* Below the trigger by default, above it when there is more room there.
       A trigger near the fold left the panel with a few visible lines and
       the rest behind the bottom of the window. */
    const below = window.innerHeight - rect.bottom - gutter * 2;
    const above = rect.top - gutter * 2;
    if (below < 240 && above > below) {
      setAnchor({ top: Math.max(gutter, rect.top - 8 - above), left, maxHeight: above });
      return;
    }
    setAnchor({ top: rect.bottom + 8, left, maxHeight: Math.max(160, below) });
  }, [align, width]);

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
    /* Capture, so a scroll of the container the trigger sits in counts and
       not only a scroll of the window. */
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
      aria-label={label}
      data-surface={surface ?? undefined}
      data-testid={`${testId}-panel`}
      /* Anything inside that acts closes the panel, so a menu item does not
         leave a stale panel sitting over the change it just made. */
      onClick={closesOnAction ? () => setIsOpen(false) : undefined}
      style={{ top: anchor.top, left: anchor.left, width, maxHeight: anchor.maxHeight }}
      className={[
        'fixed z-50 rounded-lg border border-edge bg-surface-raised text-left shadow-overlay',
        'overflow-y-auto max-w-[calc(100vw-1.5rem)]',
      ].join(' ')}
    >
      {children}
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
        aria-label={label}
        onClick={() => setIsOpen((open) => !open)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {isOpen ? createPortal(panel, document.body) : null}
    </span>
  );
}
