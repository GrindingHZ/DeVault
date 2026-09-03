import type { ReactElement, ReactNode } from 'react';

/* Hand drawn rather than a dependency. Twelve paths against a library of a
   thousand icons is a poor trade, and every one of these inherits its colour
   from the text around it, which is what keeps them inside the token system
   instead of beside it.

   docs/DESIGN-BRIEF.md rule 3: no emoji as icons, SVG only. */

export interface IconProps {
  /* Decorative by default: a rail item says its name in text underneath, so
     the icon repeating it would make a screen reader say everything twice. */
  readonly title?: string;
}

function Icon({ title, children }: IconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title === undefined ? true : undefined}
      role={title === undefined ? undefined : 'img'}
      className="h-5 w-5 shrink-0"
    >
      {title === undefined ? null : <title>{title}</title>}
      {children}
    </svg>
  );
}

export function BrowseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h6M10 16h4" />
    </Icon>
  );
}

export function ListingIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8z" />
      <circle cx="8.4" cy="8.4" r="1.2" />
    </Icon>
  );
}

export function LoanIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Icon>
  );
}

export function OfferIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </Icon>
  );
}

export function FundedIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
      <path d="M5 6.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5" />
      <path d="M5 11.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5" />
    </Icon>
  );
}

/* Two columns of different heights: what is owed and what is owned, which is
   what the screen behind it holds. */
export function PortfolioIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 20h16" />
      <rect x="6" y="11" width="4" height="9" />
      <rect x="14" y="5" width="4" height="15" />
    </Icon>
  );
}

/* Two arrows passing each other: a position leaving one hand for another,
   which is what the secondary market is. */
export function ExchangeIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 8h14" />
      <path d="M14 4l4 4-4 4" />
      <path d="M20 16H6" />
      <path d="M10 12l-4 4 4 4" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1" />
      <rect x="3" y="8" width="18" height="11" rx="2" />
      <path d="M16.5 13.5h.01" />
    </Icon>
  );
}

export function BellIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M18 9a6 6 0 0 0-12 0c0 4.5-1.5 6-1.5 6h15S18 13.5 18 9" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M6 9.5l6 6 6-6" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H10" />
    </Icon>
  );
}

/* A photograph beside a line of text, three times over. */
export function RowsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="4" height="4" rx="1" />
      <rect x="3" y="15" width="4" height="4" rx="1" />
      <path d="M10 7h11M10 17h11" />
    </Icon>
  );
}

/* Two columns, which is what the gallery lays out. */
export function GalleryIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="14" width="7" height="5.5" rx="1" />
      <rect x="13.5" y="14" width="7" height="5.5" rx="1" />
    </Icon>
  );
}

/* The five categories a vault takes. Line drawings at the same weight as
   every other icon here: a set of little pictures at different densities
   reads as clip art rather than as a legend. */
export function BullionIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M6.5 9h11l1.5 4.5H5z" />
      <path d="M3.5 20h17" />
      <path d="M5 13.5h14v6.5H5z" />
    </Icon>
  );
}

export function WatchIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 9.5V12l1.8 1.2" />
      <path d="M9 6.6L9.4 3h5.2l.4 3.6M9 17.4L9.4 21h5.2l.4-3.6" />
    </Icon>
  );
}

export function JewelleryIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M8 4h8l3 4.5-7 11-7-11z" />
      <path d="M5 8.5h14M9.5 8.5L12 19.5l2.5-11L12 4z" />
    </Icon>
  );
}

export function CollectibleIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M8 3h8v4a4 4 0 0 1-8 0z" />
      <path d="M16 4.5h3v1.5a3 3 0 0 1-3 3M8 4.5H5V6a3 3 0 0 0 3 3" />
      <path d="M12 11v4M9 20h6M10 15h4l.7 5h-5.4z" />
    </Icon>
  );
}

export function ArtIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M6.5 16l3.5-4.5 2.5 3 2-2.5 3 4z" />
      <circle cx="9" cy="8.5" r="1.2" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M9 5v14M15 5v14" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M7 4.5l12 7.5-12 7.5z" />
    </Icon>
  );
}

/* Escrow: the pledge that holds a receipt while lenders compete for it. */
export function LockIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <path d="M12 15v2" />
    </Icon>
  );
}

/* Whoever signed: on chain a person is an address, and the icon says a
   person where the hash beside it cannot. */
export function PersonIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}
