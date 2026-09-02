import type { ReactElement } from 'react';
import { ItemPhotograph } from './item-photograph';
import { LoanToValue } from './loan-to-value';
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
  /* What this category allows, so the chip bands against the right limit. */
  readonly categoryMaxLoanToValueBasisPoints: number;
  readonly bestRateBasisPoints: number | null;
  readonly closesIn: string;
  readonly photographSrc: string | null;
  readonly relationship: CollateralRelationship;
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
  offered: 'Your offer',
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
        no offers
      </span>
    );
  }
  return (
    <span className="shrink-0 whitespace-nowrap font-figure text-sm font-semibold tabular-nums text-ink-primary">
      {formatRate(basisPoints).replace(' p.a.', '')}
    </span>
  );
}

/* The category and the time left, divided rather than boxed.

   These were two chips in a row of three. One chip earns its shape because
   it bands a ratio against a limit; the other two are plain facts, and three
   boxes side by side read as a control panel rather than a description. */
function Facts({ item }: { readonly item: CollateralItem }): ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-body text-xs text-ink-secondary">
      <span className="truncate">{item.categoryName}</span>
      <span aria-hidden="true" className="text-edge-strong">
        /
      </span>
      <span className="whitespace-nowrap">{item.closesIn}</span>
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
      className={`flex w-full items-start gap-3 border-b border-l-2 border-edge px-3 py-2 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
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
        {/* Three facts, not six. The category, the share of the appraisal and
            how long is left are what a lender sorts on; the amount is the
            borrower's and is not something a lender competes on (rule M4).

            Body font, not mono. A monospace on words reads as a typewriter,
            and DESIGN-BRIEF reserves the mono for amounts, rates and ids. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <LoanToValue
            basisPoints={item.loanToValueBasisPoints}
            capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
          />
          <Facts item={item} />
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
         reads as the object rather than as a box with a picture inside it. */
      /* `w-full`, because a button sizes to its content by default and the
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
          <LoanToValue
            basisPoints={item.loanToValueBasisPoints}
            capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
          />
          {/* The tile has one line for this, so the reader's own standing
              takes it when there is one: that they hold an offer here
              outranks how long the listing has left. */}
          {item.relationship === 'none' ? (
            <span className="truncate font-body text-xs text-ink-secondary">{item.closesIn}</span>
          ) : (
            <Relationship value={item.relationship} />
          )}
        </span>
      </span>
    </button>
  );
}
