import type { ReactElement } from 'react';
import { StatusBadge } from './status-badge';
import type { StatusTone } from './status-badge';

export interface PositionRowProps {
  readonly itemDescription: string;
  readonly side: 'borrowing' | 'lending';
  readonly stage: string;
  readonly tone: StatusTone;
  /* The whole sub-line. Not a fragment glued onto a fixed side reading:
     "You lent" is false for an offer that was outbid, and the row has to be
     able to say so. */
  readonly caption: string;
  readonly figure: { readonly label: string; readonly value: string } | null;
  readonly actionLabel: string | null;
  readonly onAct?: (() => void) | undefined;
  /* Omitted when the row has nowhere to go. A control that does nothing when
     pressed is worse than no control: it teaches the reader that pressing
     things here is pointless. */
  readonly onOpen?: (() => void) | undefined;
  readonly needsAttention?: boolean | undefined;
}

/* One row of the portfolio table. The item leads, because that is the thing a
   person remembers; the identifiers they were shown before are how our
   systems refer to it, not what it is. */
export function PositionRow({
  itemDescription,
  side,
  stage,
  tone,
  caption,
  figure,
  actionLabel,
  onAct,
  onOpen,
  needsAttention,
}: PositionRowProps): ReactElement {
  const reading = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-body text-sm font-semibold text-ink-primary">
          {itemDescription}
        </span>
        <span className="truncate font-body text-xs text-ink-secondary">{caption}</span>
      </span>
      <StatusBadge tone={tone} label={stage} />
      {/* Fixed width so a column of figures lines up down the table even
          though each row's figure means something different. */}
      <span className="hidden w-32 shrink-0 flex-col items-end gap-0.5 sm:flex">
        {figure === null ? null : (
          <>
            <span className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
              {figure.value}
            </span>
            <span className="font-body text-xs text-ink-secondary">{figure.label}</span>
          </>
        )}
      </span>
    </>
  );

  return (
    <div
      data-testid="position-row"
      data-side={side}
      data-attention={needsAttention === true ? 'true' : undefined}
      className={`flex items-center gap-3 border-b border-l-2 border-edge px-3 py-2 transition-colors duration-control ease-enter hover:bg-surface-sunken ${
        needsAttention === true ? 'border-l-status-warning' : 'border-l-transparent'
      }`}
    >
      {onOpen === undefined ? (
        <span className="flex min-w-0 flex-1 items-center gap-3">{reading}</span>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
        >
          {reading}
        </button>
      )}
      {/* Acting is not navigating. A reclaim moves money and must not also
          take the reader somewhere else, so the two are separate controls
          rather than one button with a nested one inside it. */}
      <span className="w-36 shrink-0 text-right">
        {actionLabel === null ? null : (
          <button
            type="button"
            onClick={onAct}
            className="rounded-sm border border-edge-strong px-2 py-1 font-body text-xs font-medium text-ink-primary transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
          >
            {actionLabel}
          </button>
        )}
      </span>
    </div>
  );
}
