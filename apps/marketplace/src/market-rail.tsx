import {
  BrowseIcon,
  FundedIcon,
  ListingIcon,
  LoanIcon,
  NavRail,
  NavRailItem,
  OfferIcon,
  ReceiptIcon,
  WalletIcon,
} from '@depawn/ui';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

/* One list, in the order somebody works through the product: find something,
   look at what you own, put it up, watch what it owes, then the lending side,
   then the money. */
const destinations: readonly {
  readonly to: string;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { to: '/listings', label: 'Browse', icon: <BrowseIcon /> },
  { to: '/borrow/receipts', label: 'My items', icon: <ReceiptIcon /> },
  { to: '/borrow/listings', label: 'Listings', icon: <ListingIcon /> },
  { to: '/borrow/loans', label: 'My loans', icon: <LoanIcon /> },
  { to: '/lend/offers', label: 'My offers', icon: <OfferIcon /> },
  { to: '/lend/loans', label: 'Funded', icon: <FundedIcon /> },
  { to: '/wallet', label: 'Wallet', icon: <WalletIcon /> },
];

/* Longest match wins, so /borrow/listings does not light up Browse and the
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
            className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-status-active"
          >
            <NavRailItem icon={destination.icon} label={destination.label} isActive={active} />
          </Link>
        );
      })}
    </NavRail>
  );
}
