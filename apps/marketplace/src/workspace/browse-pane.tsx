import { nameForCategory } from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import { CollateralCard, CollateralRow, EmptyState, Skeleton } from '@depawn/ui';
import type { CollateralItem, CollateralRelationship } from '@depawn/ui';
import type { ReactElement } from 'react';
import { BrowseFilters } from './browse-filters';
import type { BrowseDensity, BrowseScope, BrowseSort } from './browse-filters';

export type { BrowseDensity, BrowseScope, BrowseSort };

/* What the icon shows a number for. Sort is deliberately not counted: there
   is always a sort, so counting it would mean the badge never reads zero. */
function activeFilterCount(props: BrowsePaneProps): number {
  return (props.category === '' ? 0 : 1) + (props.maxLoanToValue === '' ? 0 : 1);
}

export interface BrowsePaneProps {
  readonly listings: readonly ListingSummary[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly selectedListingId: string | null;
  readonly onSelect: (listingId: string) => void;
  readonly relationshipFor: (listing: ListingSummary) => CollateralRelationship;
  readonly nowEpochMs: number;
  readonly category: string;
  readonly onCategory: (value: string) => void;
  readonly maxLoanToValue: string;
  readonly onMaxLoanToValue: (value: string) => void;
  readonly sort: BrowseSort;
  readonly onSort: (value: BrowseSort) => void;
  readonly scope: BrowseScope;
  readonly onScope: (value: BrowseScope) => void;
  readonly density: BrowseDensity;
  readonly onDensity: (value: BrowseDensity) => void;
}

/* One unit, the largest that still says something true, and the word after
   it rather than a sentence before it.

   "closes in 71d 23h" took a line of its own and read as prose while saying
   almost nothing: at seventy one days the hours do not change any decision.
   Under an hour they do, so that is the only case that keeps two figures. */
export function closesIn(expiresAt: string, nowEpochMs: number): string {
  const remaining = Date.parse(expiresAt) - nowEpochMs;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return 'closed';
  }
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 60) {
    return `${String(minutes)}m left`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)}h left`;
  }
  return `${String(Math.floor(hours / 24))}d left`;
}

function itemFrom(
  listing: ListingSummary,
  relationship: CollateralRelationship,
  bestRate: number | null,
  nowEpochMs: number,
): CollateralItem {
  return {
    listingId: listing.id,
    itemDescription: listing.itemDescription,
    itemCategory: listing.itemCategory,
    categoryName: nameForCategory(listing.itemCategory),
    appraisedValue: listing.appraisedValue,
    requestedPrincipal: listing.requestedPrincipal,
    loanToValueBasisPoints: listing.loanToValueBasisPoints,
    categoryMaxLoanToValueBasisPoints: listing.categoryMaxLoanToValueBasisPoints,
    bestRateBasisPoints: bestRate,
    closesIn: closesIn(listing.expiresAt, nowEpochMs),
    photographSrc: listing.hasPhotograph ? `/api/v1/receipts/${listing.receiptId}/photo` : null,
    relationship,
  };
}

/* The left pane. Filtering and sorting go to the api rather than being
   applied to a page already fetched: filtering what happens to have loaded
   hides rows from the reader while telling them they have seen everything. */
export function BrowsePane(props: BrowsePaneProps): ReactElement {
  const { listings, isPending, isError, density } = props;

  return (
    <div className="flex min-h-0 flex-col">
      <BrowseFilters
        scope={props.scope}
        onScope={props.onScope}
        category={props.category}
        onCategory={props.onCategory}
        maxLoanToValue={props.maxLoanToValue}
        onMaxLoanToValue={props.onMaxLoanToValue}
        sort={props.sort}
        onSort={props.onSort}
        density={props.density}
        onDensity={props.onDensity}
        activeCount={activeFilterCount(props)}
      />
      {isPending ? (
        <div className="p-3">
          <Skeleton lineCount={5} />
        </div>
      ) : isError ? (
        <p role="alert" className="p-3 font-body text-sm text-status-danger">
          The listings could not be loaded.
        </p>
      ) : listings.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title="No live listings right now"
            description="Borrowers list items after the vault has taken custody of them."
          />
        </div>
      ) : (
        <div
          data-testid="browse-table"
          className={
            density === 'gallery' ? 'grid grid-cols-2 gap-2 p-2 xl:grid-cols-3' : 'flex flex-col'
          }
        >
          {listings.map((listing) => {
            const item = itemFrom(
              listing,
              props.relationshipFor(listing),
              listing.bestOfferRateBasisPoints,
              props.nowEpochMs,
            );
            const isSelected = props.selectedListingId === listing.id;
            return density === 'gallery' ? (
              <span key={listing.id} data-testid={`listing-${listing.id}`}>
                <CollateralCard item={item} isSelected={isSelected} onSelect={props.onSelect} />
              </span>
            ) : (
              <span key={listing.id} data-testid={`listing-${listing.id}`}>
                <CollateralRow item={item} isSelected={isSelected} onSelect={props.onSelect} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
