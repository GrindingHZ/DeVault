import { useState } from 'react';
import type { ReactElement } from 'react';
import { PauseIcon, PlayIcon } from './icons';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { formatRate } from './rate';

export type TapeEventKind = 'OFFER_PLACED' | 'LOAN_ORIGINATED';

export interface TapeItem {
  readonly at: string;
  readonly kind: TapeEventKind;
  readonly listingId: string;
  readonly itemDescription: string;
  readonly rateBasisPoints: number;
  readonly amount: MoneyValue;
}

export interface TapeProps {
  readonly items: readonly TapeItem[];
  readonly selectedListingId?: string | null;
  readonly onSelectListing?: (listingId: string) => void;
}

const verbs: Record<TapeEventKind, string> = {
  OFFER_PLACED: 'offered',
  LOAN_ORIGINATED: 'funded',
};

/* Clock time, not a relative phrase. A tape is read by glancing at it, and
   "3 minutes ago" forces the reader to work out when that was against a
   clock that has already moved on. */
function timeOf(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/* Everything happening across every listing, running left. Like the index
   strip it is decoration with a job: it renders nothing when empty and takes
   no action away from the workspace when its query fails.

   Three things stop the movement, and all three matter. WCAG 2.2.2 asks for a
   mechanism to pause anything that moves for more than five seconds, which is
   the button. Hovering pauses it too, because a line you are trying to click
   should not walk away from the pointer. And somebody who has asked their
   system for less motion gets none at all, which tokens.css handles so this
   component cannot forget. */
export function Tape({
  items,
  selectedListingId,
  onSelectListing,
}: TapeProps): ReactElement | null {
  const [isPaused, setPaused] = useState(false);

  if (items.length === 0) {
    return null;
  }

  /* Rendered twice so the loop has no seam. The second copy is hidden from
     assistive technology: it is the same events again, and a screen reader
     reading the whole tape twice would be worse than not reading it. */
  const track = (ariaHidden: boolean): ReactElement => (
    <div aria-hidden={ariaHidden ? true : undefined} className="flex shrink-0 items-center gap-4">
      {items.map((item, index) => (
        <button
          key={`${item.listingId}-${item.at}-${String(index)}`}
          type="button"
          tabIndex={ariaHidden ? -1 : undefined}
          onClick={() => onSelectListing?.(item.listingId)}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-2 py-0.5 font-body text-xs transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
            selectedListingId === item.listingId ? 'bg-surface-raised' : ''
          }`}
        >
          <span className="font-mono tabular-nums text-ink-secondary">{timeOf(item.at)}</span>
          <span className="max-w-48 truncate text-ink-primary">{item.itemDescription}</span>
          <span className="text-ink-secondary">{verbs[item.kind]}</span>
          <span className="font-mono font-semibold tabular-nums text-ink-primary">
            {formatRate(item.rateBasisPoints).replace(' p.a.', '')}
          </span>
          <span className="text-ink-secondary">{formatMoney(item.amount)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex items-center gap-2 border-t border-edge bg-surface-sunken pr-2">
      <button
        type="button"
        data-testid="tape-pause"
        aria-pressed={isPaused}
        onClick={() => setPaused((paused) => !paused)}
        className="shrink-0 border-r border-edge px-2 py-1 text-ink-secondary transition-colors duration-control ease-enter hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
      >
        {isPaused ? <PlayIcon title="Start the tape" /> : <PauseIcon title="Pause the tape" />}
      </button>

      <div
        role="log"
        aria-label="Recent market activity"
        aria-live="off"
        className="group flex min-w-0 flex-1 overflow-hidden py-1"
      >
        <div
          data-ticker="true"
          data-paused={isPaused ? 'true' : undefined}
          style={isPaused ? { animationPlayState: 'paused' } : undefined}
          className="flex w-max items-center gap-4 animate-ticker [animation-play-state:running] group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] motion-reduce:animate-none"
        >
          {track(false)}
          {track(true)}
        </div>
      </div>
    </div>
  );
}
