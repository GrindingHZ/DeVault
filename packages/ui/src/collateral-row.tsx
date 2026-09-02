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
   needs to know at a glance which of these are already theirs. */
const relationshipReadings: Record<CollateralRelationship, string | null> = {
  none: null,
  borrower: 'yours',
  offered: 'you offered',
  funded: 'you funded',
};

function Relationship({ value }: { readonly value: CollateralRelationship }): ReactElement | null {
  const reading = relationshipReadings[value];
  if (reading === null) {
    return null;
  }
  return (
    <span className="rounded-sm border border-edge-strong px-2 font-body text-xs text-ink-secondary">
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
    <span className="shrink-0 whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-ink-primary">
      {formatRate(basisPoints).replace(' p.a.', '')}
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          {/* The description is the identity, and these run long: a real
              appraisal names the maker, the model, the size and the
              certificate. Truncating on one line cut off exactly the part
              that told two of them apart, so it wraps to two instead. */}
          <span className="line-clamp-2 font-body text-sm font-semibold leading-snug text-ink-primary">
            {item.itemDescription}
          </span>
          <AskingRate basisPoints={item.bestRateBasisPoints} />
        </span>
        {/* Three facts, not six. The category, the share of the appraisal and
            how long is left are what a lender sorts on; the amount is the
            borrower's and is not something a lender competes on (rule M4).

            Body font, not mono. A monospace on words reads as a typewriter,
            and DESIGN-BRIEF reserves the mono for amounts, rates and ids. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-ink-secondary">
          <span>{item.categoryName}</span>
          <LoanToValue
            basisPoints={item.loanToValueBasisPoints}
            capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
          />
          <span>{item.closesIn}</span>
          <Relationship value={item.relationship} />
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
      className={`flex flex-col gap-2 rounded-md border p-2 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isSelected === true ? 'border-status-active bg-surface-sunken' : 'border-edge'
      }`}
    >
      <ItemPhotograph src={item.photographSrc} alt={item.itemDescription} size="detail" />
      <span className="line-clamp-2 font-body text-sm font-medium text-ink-primary">
        {item.itemDescription}
      </span>
      <span className="flex flex-wrap items-center gap-2 font-body text-xs text-ink-secondary">
        <LoanToValue
          basisPoints={item.loanToValueBasisPoints}
          capBasisPoints={item.categoryMaxLoanToValueBasisPoints}
        />
        <AskingRate basisPoints={item.bestRateBasisPoints} />
        <Relationship value={item.relationship} />
      </span>
    </button>
  );
}
