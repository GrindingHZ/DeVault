import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from './button';

export interface DialogProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /* A form asks for a few values and wants a narrow measure. A record puts
     a photograph beside a column of figures and cannot do it in `md`. */
  readonly width?: 'md' | 'lg';
}

const widths = {
  md: 'max-w-md',
  lg: 'max-w-3xl',
} as const;

export function Dialog({
  title,
  isOpen,
  onClose,
  children,
  width = 'md',
}: DialogProps): ReactElement | null {
  /* Escape closes it. Without this the only way out of a dialog was finding
     the button, which is not how anybody expects a modal to behave and is a
     keyboard trap for a reader who cannot see where the button went. */
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[85vh] w-full flex-col rounded-lg border border-edge bg-surface-raised p-6 shadow-overlay ${widths[width]}`}
      >
        <h2 className="mb-4 font-heading text-lg font-semibold text-ink-primary">{title}</h2>
        {/* The body scrolls rather than the dialog growing past the viewport,
            so a long record keeps its close button reachable. */}
        <div className="mb-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
        <Button variant="secondary" className="self-start" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
