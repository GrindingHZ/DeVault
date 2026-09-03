import {
  BrowseIcon,
  ExchangeIcon,
  NavRail,
  NavRailItem,
  PortfolioIcon,
  ReceiptIcon,
  WalletIcon,
  pressableInset,
} from '@depawn/ui';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

/* Five destinations, in the order somebody works through the product: find
   something to fund, find a position already funded, see where you stand,
   look at what you own, then the money.

   There were seven. Four of them split one person's own positions by role,
   which put the same loan behind two different doors and made a reader who
   borrows and lends navigate to assemble a picture they should have been
   handed. That split survives as a filter on the portfolio, not as
   navigation. The Secondary Market earns its own place because it is a
   different market, not a different view of this person's things. */
const destinations: readonly {
  readonly to: string;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { to: '/listings', label: 'Browse', icon: <BrowseIcon /> },
  { to: '/secondary-market', label: 'Secondary Market', icon: <ExchangeIcon /> },
  { to: '/portfolio', label: 'Portfolio', icon: <PortfolioIcon /> },
  { to: '/borrow/receipts', label: 'My items', icon: <ReceiptIcon /> },
  { to: '/wallet', label: 'Wallet', icon: <WalletIcon /> },
];

/* Longest match wins, so /borrow/receipts does not light up Browse and the
   workspace stays lit while a listing is selected in its search params. */
function isCurrent(pathname: string, to: string): boolean {
  if (pathname === to) {
    return true;
  }
  const deeper = destinations.filter(
    (destination) => destination.to !== to && pathname.startsWith(`${destination.to}/`),
  );
  return pathname.startsWith(`${to}/`) && deeper.length === 0;
}

export function MarketRail(): ReactElement {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <NavRail>
      {destinations.map((destination) => {
        const active = isCurrent(pathname, destination.to);
        return (
          <Link
            key={destination.to}
            to={destination.to}
            aria-current={active ? 'page' : undefined}
            /* The link takes the gesture, not the item inside it: the anchor
               is what a reader points at and what takes focus. */
            className={[pressableInset, 'rounded-sm'].join(' ')}
          >
            <NavRailItem icon={destination.icon} label={destination.label} isActive={active} />
          </Link>
        );
      })}
    </NavRail>
  );
}
