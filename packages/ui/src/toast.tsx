import type { ReactElement } from 'react';
import type { StatusTone } from './status-badge';

export interface ToastMessage {
  readonly id: string;
  readonly tone: StatusTone;
  readonly text: string;
}

/* An escape rather than an HTML numeric entity: the token check reads a hash
   followed by hex digits as a colour, and the entity for this glyph is
   exactly that shape. */
const dismissGlyph = '×';

const borderByTone: Record<StatusTone, string> = {
  neutral: 'border-status-neutral',
  active: 'border-status-active',
  success: 'border-status-success',
  warning: 'border-status-warning',
  danger: 'border-status-danger',
};

export interface ToastRegionProps {
  readonly messages: readonly ToastMessage[];
  /* Without this a message never leaves, and a screen somebody works in for
     an hour ends up stacked with every outcome it ever reported. */
  readonly onDismiss?: (id: string) => void;
}

export function ToastRegion({ messages, onDismiss }: ToastRegionProps): ReactElement {
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {messages.map((message) => (
        <div
          key={message.id}
          className={[
            'flex items-start gap-3 rounded-md border-l-4 bg-surface-raised px-4 py-3 shadow-overlay',
            borderByTone[message.tone],
          ].join(' ')}
        >
          <p className="font-body text-sm text-ink-primary">{message.text}</p>
          {onDismiss === undefined ? null : (
            <button
              type="button"
              onClick={() => onDismiss(message.id)}
              aria-label={`Dismiss: ${message.text}`}
              className="shrink-0 rounded-sm px-1 font-mono text-sm text-ink-secondary transition-colors duration-control ease-enter hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
            >
              {dismissGlyph}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
