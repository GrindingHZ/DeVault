import { useState } from 'react';
import type { ReactElement } from 'react';
import { CategoryIcon } from './category-icon';
import { PauseIcon, PlayIcon } from './icons';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { formatRate } from './rate';

/* One open listing on the browse ticker: its category (the raw code drives the
   icon, the label is the words the caller already has), its name, the keenest
   rate a lender is offering on it right now, and the principal the borrower
   asked for. */
export interface TapeItem {
  readonly listingId: string;
  readonly itemCategory: string;
  readonly categoryLabel: string;
  readonly itemDescription: string;
  readonly rateBasisPoints: number;
  readonly amount: MoneyValue;
}

export interface TapeProps {
  readonly items: readonly TapeItem[];
  readonly selectedListingId?: string | null;
  readonly onSelectListing?: (listingId: string) => void;
}

/* The listings a lender can act on, running left. Like the index strip it is
   decoration with a job: it renders nothing when empty and takes no action away
   from the workspace when its data is missing.

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
     assistive technology: it is the same listings again, and a screen reader
     reading the whole tape twice would be worse than not reading it. */
  const track = (ariaHidden: boolean): ReactElement => (
    <div aria-hidden={ariaHidden ? true : undefined} className="flex shrink-0 items-center gap-4">
      {items.map((item, index) => (
        <button
          key={`${item.listingId}-${String(index)}`}
          type="button"
          tabIndex={ariaHidden ? -1 : undefined}
          onClick={() => onSelectListing?.(item.listingId)}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-2 py-0.5 font-body text-xs transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
            selectedListingId === item.listingId ? 'bg-surface-raised' : ''
          }`}
        >
          <span className="flex items-center gap-1 text-ink-secondary">
            <CategoryIcon category={item.itemCategory} className="h-3.5 w-3.5 shrink-0" />
            {item.categoryLabel}
          </span>
          <span className="max-w-48 truncate font-medium text-ink-primary">
            {item.itemDescription}
          </span>
          <span className="font-figure font-semibold tabular-nums text-accent">
            {formatRate(item.rateBasisPoints).replace(' p.a.', '')}
          </span>
          <span className="font-figure tabular-nums text-ink-secondary">
            {formatMoney(item.amount)}
          </span>
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
        aria-label="Open listings on the market"
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
