import { BellIcon, Button, Popover, StatusBadge } from '@depawn/ui';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { usePositions } from '../portfolio/use-positions';
import { usePositionActions } from '../portfolio/use-position-actions';
import type { Position } from '../portfolio/position';

/* What needs a person, wherever they are.

   This was a band across the top of the portfolio, which meant the one thing
   a reader would regret not doing was only visible on the one screen they
   had to remember to open. It was also a second copy of the reclaim banner,
   which shouted about held money on every screen and knew about nothing
   else. Both are gone: the count lives in the header, and the list behind it
   is the same positions the portfolio is built from.

   The rule for what earns a place here is stated once, in
   `portfolio/attention.ts`, and is deliberately narrow. A bell that lights
   up every day is a bell nobody reads. */
export function AttentionBell(): ReactElement {
  const navigate = useNavigate();
  const { attention } = usePositions();
  const { actOn } = usePositionActions({
    /* Repaying needs a quote, which lives on the portfolio. */
    onRepay: () => void navigate({ to: '/portfolio', search: { side: 'borrowing' } }),
    onOpen: (position) =>
      position.listingId === null
        ? void navigate({ to: '/borrow/receipts' })
        : void navigate({ to: '/listings', search: { listing: position.listingId } }),
  });

  const count = attention.length;
  /* Never a bare number. A dot alone says something is different without
     saying what, and a count alone reads as decoration until it is named. */
  const label =
    count === 0
      ? 'Nothing needs you today'
      : `${count} thing${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} you today`;

  return (
    <Popover
      label={label}
      testId="attention-bell"
      width={360}
      triggerClassName={[
        'relative inline-flex h-9 w-9 items-center justify-center rounded-full',
        'text-ink-secondary transition-colors duration-control ease-enter',
        'hover:bg-surface-sunken hover:text-ink-primary',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
      ].join(' ')}
      trigger={
        <>
          <BellIcon />
          {count === 0 ? null : (
            <span
              data-testid="attention-count"
              /* Inside the trigger rather than hung off its corner. The
                 header is the topmost row on the screen and the trigger
                 fills its height, so a badge offset outwards had its top
                 clipped by the edge of the window. */
              className="absolute right-0 top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-warning px-1 font-figure text-[10px] font-semibold tabular-nums text-surface-base"
            >
              {count}
            </span>
          )}
        </>
      }
    >
      <div className="flex flex-col">
        <p className="border-b border-edge px-4 py-3 font-body text-sm font-semibold text-ink-primary">
          {label}
        </p>
        {count === 0 ? (
          /* Said plainly rather than left blank. An empty panel reads as
             something that failed to load. */
          <p className="px-4 py-6 text-center font-body text-sm text-ink-secondary">
            Nothing is waiting on you. Anything that needs doing will appear here.
          </p>
        ) : (
          attention.map((position) => (
            <AttentionItem key={position.id} position={position} onAct={actOn} />
          ))
        )}
      </div>
    </Popover>
  );
}

function AttentionItem({
  position,
  onAct,
}: {
  readonly position: Position;
  readonly onAct: (position: Position) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2 border-b border-edge px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-sm font-semibold leading-snug text-ink-primary">
          {position.itemDescription}
        </span>
        <StatusBadge tone={position.tone} label={position.stage} />
      </div>
      <span className="font-body text-xs leading-relaxed text-ink-secondary">
        {position.caption}
      </span>
      <div className="flex items-center justify-between gap-3">
        {position.figure === null ? (
          <span />
        ) : (
          <span className="font-figure text-sm tabular-nums text-ink-primary">
            {position.figure.value}
          </span>
        )}
        {position.action === null ? null : (
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => onAct(position)}>
            {position.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
