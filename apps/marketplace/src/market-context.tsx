import { fetchBalance } from '@depawn/contracts';
import { Explain, Money } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { walletKeys } from './wallet-keys';

/* The header used to carry the name of the product and nothing else, which is
   the one thing a reader already knows.

   What they do not know without leaving the screen is how much they can
   actually commit. A lender deciding whether to offer, and a borrower
   deciding whether they can repay, are both asking about the same two
   figures, so both follow them around. */
export function MarketContext(): ReactElement | null {
  const balanceQuery = useQuery({ queryKey: walletKeys.balance, queryFn: fetchBalance });
  const balance = balanceQuery.data;

  if (balance === undefined) {
    /* No skeleton. This is a strip beside a title, and a shimmering block
       there draws more attention than the figure it stands in for. */
    return null;
  }

  return (
    <Link
      to="/wallet"
      className="flex min-w-0 items-center gap-4 rounded-sm px-2 py-1 transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
    >
      <Figure label="Available">
        <Money value={balance.available} />
      </Figure>
      <Figure label="Held" explain={<Explain termId="heldFunds" audience="lender" />}>
        <Money value={balance.held} />
      </Figure>
    </Link>
  );
}

function Figure({
  label,
  children,
  explain,
}: {
  readonly label: string;
  readonly children: ReactElement;
  readonly explain?: ReactElement;
}): ReactElement {
  return (
    <span className="flex items-baseline gap-2">
      <span className="flex items-center font-body text-xs text-ink-secondary">
        {label}
        {explain}
      </span>
      <span className="font-figure text-sm">{children}</span>
    </span>
  );
}
