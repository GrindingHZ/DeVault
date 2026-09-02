import { nameForCategory } from '@depawn/contracts';
import type { ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import { ItemPhotograph, Money, custodyReadingFor } from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import type { ReactElement, ReactNode } from 'react';

/* Tailwind needs whole class names, so the tone maps to a written out pair
   rather than to an interpolated colour. */
const bandByTone: Record<StatusTone, string> = {
  neutral: 'border-t-status-neutral text-status-neutral',
  active: 'border-t-status-active text-status-active',
  success: 'border-t-status-success text-status-success',
  warning: 'border-t-status-warning text-status-warning',
  danger: 'border-t-status-danger text-status-danger',
};

/* The tail rather than the head: a ULID begins with a timestamp, so every
   receipt issued the same afternoon shares its first characters and only the
   end of the string tells two of them apart. */
export function shortReference(id: string): string {
  return id.slice(-6).toUpperCase();
}

export interface HoldingTileProps {
  readonly receipt: ReceiptResponse;
  readonly redemption: RedemptionRequestResponse | undefined;
  readonly onOpen: (receiptId: string) => void;
  /* The two things a borrower can do with an item still in the vault. Passed
     in rather than raised from here, because both are mutations the screen
     owns and a tile should not know how to start. */
  readonly actions?: ReactNode;
}

/* A holding, photograph first. A borrower has a handful of things in a vault
   and knows each one on sight, which is the argument for a tile over a table
   row: the item is the thing being shown, not a cell in it.

   One weight per tile (docs/DESIGN-BRIEF.md, P8f). The item name is what the
   reader is looking for, so the name is bold and the figure beside it is not. */
export function HoldingTile({
  receipt,
  redemption,
  onOpen,
  actions,
}: HoldingTileProps): ReactElement {
  const reading = custodyReadingFor(receipt.status, redemption?.status ?? null);
  /* An item that has left, or been sold, is still worth listing and still
     worth reading. It is simply no longer live, and says so by receding. */
  const isSpent = receipt.status === 'RELEASED' || receipt.status === 'LIQUIDATED';

  return (
    <article
      data-testid={`holding-${receipt.id}`}
      className={`relative flex flex-col overflow-hidden rounded-lg border border-edge bg-surface-raised transition-colors duration-control ease-enter focus-within:border-edge-strong hover:border-edge-strong ${
        isSpent ? 'opacity-60' : ''
      }`}
    >
      <div className="relative">
        <ItemPhotograph
          src={receipt.hasPhotograph ? `/api/v1/receipts/${receipt.id}/photo` : null}
          alt={receipt.itemDescription}
          size="tile"
          testId={`photo-${receipt.id}`}
        />
        {/* Status is a word, never only a colour (docs/DESIGN-BRIEF.md). */}
        <span
          data-testid={`redemption-${receipt.id}`}
          className={`absolute inset-x-0 bottom-0 border-t bg-surface-sunken px-3 py-1 font-body text-xs font-medium uppercase tracking-wide ${bandByTone[reading.tone]}`}
        >
          {reading.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* The whole tile is the target, using one real button rather than a
            click handler on the article, so the keyboard and a screen reader
            get the same affordance the mouse does. */}
        <button
          type="button"
          onClick={() => onOpen(receipt.id)}
          className="text-left font-body text-sm font-semibold text-ink-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
        >
          {receipt.itemDescription}
        </button>
        <span className="font-body text-xs text-ink-secondary">
          {nameForCategory(receipt.itemCategory)}
        </span>
        <span
          className={`font-figure text-sm tabular-nums text-ink-primary ${isSpent ? 'line-through' : ''}`}
        >
          <Money value={receipt.appraisedValue} />
        </span>
        <span
          data-testid={`receipt-${receipt.id}`}
          title={receipt.id}
          className="font-mono text-xs text-ink-secondary"
        >
          Ref {shortReference(receipt.id)}
        </span>
      </div>

      {actions === undefined ? null : (
        /* Above the overlay the name casts, so these stay clickable. */
        <div className="relative z-10 flex flex-wrap gap-2 border-t border-edge p-3">{actions}</div>
      )}
    </article>
  );
}
