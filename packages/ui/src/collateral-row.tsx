import type { ReactElement } from 'react';
import { ItemPhotograph } from './item-photograph';
import { LoanToValueMeter } from './loan-to-value';
import { CurrencyMark } from './currency-mark';
import { formatAmount } from './money';
import type { MoneyValue } from './money';
import { formatRate } from './rate';

/* What the reader is to this listing. Derived from their relationship rather
   than chosen, so there is no control to leave set wrong. */
export type CollateralRelationship = 'none' | 'borrower' | 'offered' | 'funded';

export interface CollateralItem {
  readonly listingId: string;
  readonly itemDescription: string;
  readonly itemCategory: string;
  readonly categoryName: string;
  readonly appraisedValue: MoneyValue;
  readonly requestedPrincipal: MoneyValue;
  readonly loanToValueBasisPoints: number;
  /* What this category allows, so the meter bands against the right limit. */
  readonly categoryMaxLoanToValueBasisPoints: number;
  readonly bestRateBasisPoints: number | null;
  /* Already worded, and split so the date can carry the weight on its own.
     A date rather than a countdown, so the row needs no clock to render. */
  readonly closes: ClosingTime;
  /* Whether that date is close enough to change what a lender does today. */
  readonly isClosingSoon?: boolean;
  readonly photographSrc: string | null;
  readonly relationship: CollateralRelationship;
}

/* When a listing closes, in two parts.

   The date is the fact; "by" is the grammar around it. Emphasising the whole
   phrase gave equal weight to a preposition, so they are separate and only
   one of them is bold. `lead` is empty where there is no date to lead into,
   which is what "closed" is. */
export interface ClosingTime {
  readonly lead: string;
  readonly value: string;
}

export interface CollateralProps {
  readonly item: CollateralItem;
  readonly isSelected?: boolean;
  readonly onSelect?: (listingId: string) => void;
}

/* Said in words, never left to a coloured dot. A lender scanning the rail
   needs to know at a glance which of these are already theirs.

   Phrased as a possessive rather than as a sentence about the reader. "Your
   offer" is a label on a thing; "you offered" is a report of an event, and
   the rail is a list of things. */
const relationshipReadings: Record<CollateralRelationship, string | null> = {
  none: null,
  borrower: 'Your item',
  offered: 'You offered',
  funded: 'You funded',
};

/* Not a chip.

   It was a bordered pill sitting in the metadata line beside two others,
   which made the reader's own standing in a listing look like one more
   attribute of the object rather than the one line that is about them. It
   reads as small caps in the accent with no box around it, and it sits under
   the rate: the right hand column carries the reader's relationship to the
   market, the left carries what the thing is. */
function Relationship({ value }: { readonly value: CollateralRelationship }): ReactElement | null {
  const reading = relationshipReadings[value];
  if (reading === null) {
    return null;
  }
  return (
    <span className="whitespace-nowrap font-body text-[11px] font-medium uppercase tracking-wider text-accent">
      {reading}
    </span>
  );
}

function AskingRate({ basisPoints }: { readonly basisPoints: number | null }): ReactElement {
  /* Never wraps. The rail is resizable, and at its narrowest a two word
     phrase broke onto a second line and pushed the row out of rhythm. */
  if (basisPoints === null) {
    return (
      <span className="shrink-0 whitespace-nowrap font-body text-xs text-ink-secondary">
        No offers
      </span>
    );
  }
  return (
    /* Plain, deliberately. A rate has no good direction on its own: a low one
       is what a borrower wants and what a lender is beaten down to, and this
       row renders on both the browse tab and the reader's own listings.
       Colouring it would tell half the readers the opposite of the truth
       (docs/13-design-system.md, the rule MarketDelta is built on). */
    <span className="shrink-0 whitespace-nowrap font-figure text-sm font-semibold tabular-nums text-ink-primary">
      {formatRate(basisPoints).replace(' p.a.', '')}
    </span>
  );
}

/* What the borrower is asking for. The one figure a lender is actually being
   asked to put up, and the row went without it for a long time on the
   grounds that lenders compete on rate rather than amount (rule M4). They do,
   but they still have to decide whether they have it. */
function Principal({ value }: { readonly value: MoneyValue }): ReactElement {
  return (
    <span className="shrink-0 whitespace-nowrap font-figure text-sm font-semibold tabular-nums text-ink-primary">
      <CurrencyMark currency={value.currency} /> {formatAmount(value)}
    </span>
  );
}

/* When it closes. The date takes a warning tone in its last week: it is the
   one fact on the row that becomes urgent on its own, without anybody doing
   anything. */
function Closes({ item }: { readonly item: CollateralItem }): ReactElement {
  const urgent = item.isClosingSoon === true;
  return (
    <span className="whitespace-nowrap">
      {item.closes.lead === '' ? null : <span>{`${item.closes.lead} `}</span>}
      <span className={`font-semibold ${urgent ? 'text-status-warning' : 'text-ink-primary'}`}>
        {item.closes.value}
      </span>
    </span>
  );
}

/* The category and when it closes, divided rather than boxed. */
function Facts({ item }: { readonly item: CollateralItem }): ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-body text-xs text-ink-secondary">
      <span className="truncate">{item.categoryName}</span>
      <span aria-hidden="true" className="text-edge-strong">
        |
      </span>
      <Closes item={item} />
    </span>
  );
}

/* The dense form, for comparing many items against each other. */
export function CollateralRow({ item, isSelected, onSelect }: CollateralProps): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.listingId)}
      aria-pressed={isSelected === true}
      data-selected={isSelected === true ? 'true' : undefined}
      className={`flex w-full items-start gap-3 border-b border-l-2 border-edge px-3 py-2.5 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isSelected === true ? 'border-l-status-active bg-surface-sunken' : 'border-l-transparent'
      }`}
    >
      <ItemPhotograph src={item.photographSrc} alt={item.itemDescription} size="row" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          {/* The description is the identity, and these run long: a real
              appraisal names the maker, the model, the size and the
              certificate. Truncating on one line cut off exactly the part
              that told two of them apart, so it wraps to two instead. */}
          <span className="line-clamp-2 font-body text-sm font-semibold leading-snug text-ink-primary">
            {item.itemDescription}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <AskingRate basisPoints={item.bestRateBasisPoints} />
            <Relationship value={item.relationship} />
          </span>
        </span>

        <Facts item={item} />

        {/* The amount asked for and how far into the category's allowance it
            reaches, on one line. A lender deciding whether to offer is asking
            both at once: can I put this up, and is it well covered. */}
        <span className="flex min-w-0 items-center gap-2.5">
          <Principal value={item.requestedPrincipal} />
          <LoanToValueMeter
            basisPoints={item.loanToValueBasisPoints}
            capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
          />
        </span>
      </span>
    </button>
  );
}

/* The gallery form, for hunting rather than comparing. Same data, more
   photograph, fewer per screen. */
export function CollateralCard({ item, isSelected, onSelect }: CollateralProps): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.listingId)}
      aria-pressed={isSelected === true}
      data-selected={isSelected === true ? 'true' : undefined}
      /* The photograph runs to the edges and the card clips it, so a tile
         reads as the object rather than as a box with a picture inside it.
         `w-full`, because a button sizes to its content by default and the
         tiles came out three different widths inside a grid whose cells were
         all the same. */
      className={`flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isSelected === true ? 'border-status-active bg-surface-sunken' : 'border-edge'
      }`}
    >
      <ItemPhotograph src={item.photographSrc} alt={item.itemDescription} size="tile" />
      <span className="flex min-w-0 flex-col gap-1.5 p-2">
        <span className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 font-body text-sm font-semibold leading-snug text-ink-primary">
            {item.itemDescription}
          </span>
          <AskingRate basisPoints={item.bestRateBasisPoints} />
        </span>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <Principal value={item.requestedPrincipal} />
          {/* The tile has one line for this, so the reader's own standing
              takes it when there is one: that they hold an offer here
              outranks how long the listing has left. */}
          {item.relationship === 'none' ? (
            <span className="truncate font-body text-xs text-ink-secondary">
              <Closes item={item} />
            </span>
          ) : (
            <Relationship value={item.relationship} />
          )}
        </span>
        <LoanToValueMeter
          basisPoints={item.loanToValueBasisPoints}
          capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
        />
      </span>
    </button>
  );
}
