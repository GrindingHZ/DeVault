import { fetchBalance } from '@depawn/contracts';
import { ChevronDownIcon, Money, Popover, WalletIcon, formatMoney } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { walletKeys } from '../wallet-keys';

/* What the reader can commit, in one pill rather than a row of figures.

   The header used to carry both balances spelled out with their labels,
   which is two thirds of a wallet screen wedged beside the product name. A
   lender deciding whether to offer only needs the one number; the held
   figure matters when it is not zero, and then it matters a lot, so it is
   one click away rather than gone. */
export function BalanceMenu(): ReactElement | null {
  const navigate = useNavigate();
  const balanceQuery = useQuery({ queryKey: walletKeys.balance, queryFn: fetchBalance });
  const balance = balanceQuery.data;

  if (balance === undefined) {
    /* No skeleton. This is a pill beside a title, and a shimmering block
       there draws more attention than the figure it stands in for. */
    return null;
  }

  const isHolding = BigInt(balance.held.minorUnits) > 0n;

  return (
    <Popover
      label={`Balance ${formatMoney(balance.available)}. Open wallet menu`}
      testId="balance-menu"
      width={280}
      triggerClassName={[
        'inline-flex items-center gap-2 rounded-full border border-edge bg-surface-sunken',
        'py-1.5 pl-3 pr-2 transition-colors duration-control ease-enter',
        'hover:border-edge-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
      ].join(' ')}
      trigger={
        <>
          <span className="text-ink-secondary">
            <WalletIcon />
          </span>
          <span
            data-testid="header-available"
            className="font-figure text-sm font-semibold tabular-nums text-ink-primary"
          >
            {formatMoney(balance.available)}
          </span>
          {/* Held money is invisible until there is some, and then it is the
              reason the spendable figure looks wrong. */}
          {isHolding ? (
            <span
              data-testid="header-held-dot"
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-status-warning"
            />
          ) : null}
          <span className="text-ink-secondary">
            <ChevronDownIcon />
          </span>
        </>
      }
    >
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-edge px-4 py-3">
          <Line label="Available to spend" value={<Money value={balance.available} />} />
          <Line
            label="Held against offers"
            value={<Money value={balance.held} />}
            note={
              isHolding
                ? 'Committed to offers you have standing. It is not spendable until an offer is settled or reclaimed.'
                : null
            }
          />
        </div>
        <MenuItem label="Open wallet" onSelect={() => void navigate({ to: '/wallet' })} />
        <MenuItem label="Add funds" onSelect={() => void navigate({ to: '/wallet' })} />
      </div>
    </Popover>
  );
}

function Line({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: ReactElement;
  readonly note?: string | null;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-body text-xs text-ink-secondary">{label}</span>
        <span className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
          {value}
        </span>
      </div>
      {note === null || note === undefined ? null : (
        <span className="font-body text-xs leading-relaxed text-ink-secondary">{note}</span>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onSelect,
}: {
  readonly label: string;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="px-4 py-2.5 text-left font-body text-sm text-ink-primary transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-status-active"
    >
      {label}
    </button>
  );
}
