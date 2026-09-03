import { ChevronDownIcon, Popover, WalletIcon } from '@depawn/ui';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { formatUsdc } from '../wallet/usdc';
import { useAvailableUsdc } from '../wallet/use-wallet-money';

/* The one number a lender needs before deciding whether to offer: the USDC free
   in their own wallet, read straight from the chain. There is no held figure
   here any more, because held money now lives in the escrow objects the wallet
   page reads, not in a platform ledger account. */
export function BalanceMenu(): ReactElement | null {
  const navigate = useNavigate();
  const { isReady, availableBaseUnits, decimals } = useAvailableUsdc();

  if (!isReady) {
    return null;
  }

  const available = formatUsdc(availableBaseUnits, decimals);

  return (
    <Popover
      label={`Balance ${available}. Open wallet menu`}
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
            {available}
          </span>
          <span className="text-ink-secondary">
            <ChevronDownIcon />
          </span>
        </>
      }
    >
      <div className="flex flex-col">
        <div className="border-b border-edge px-4 py-3">
          <p className="font-body text-xs text-ink-secondary">Available to spend</p>
          <p className="font-figure text-lg font-semibold tabular-nums text-ink-primary">
            {available}
          </p>
        </div>
        <MenuItem label="Open wallet" onSelect={() => void navigate({ to: '/wallet' })} />
      </div>
    </Popover>
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
