import { browseListings, fetchListing, fetchMyOffers, nameForCategory } from '@depawn/contracts';
import type { ListingSummary } from '@depawn/contracts';
import { LifecycleSpine, Skeleton, Tape, Workspace, positionOf, spineFor } from '@depawn/ui';
import type { CollateralRelationship, MarketRole } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { MarketShell } from '../market-shell';
import { marketKeys } from '../market-keys';
import { useCurrentAccount } from '../current-account';
import { BrowsePane } from '../workspace/browse-pane';
import type { BrowseDensity, BrowseSort } from '../workspace/browse-pane';
import { DetailPane } from '../workspace/detail-pane';
import { defaultDensity, defaultSort, parseWorkspaceSearch } from '../workspace-selection';
import type { WorkspaceSearch } from '../workspace-selection';

export const Route = createFileRoute('/listings/')({
  validateSearch: parseWorkspaceSearch,
  component: WorkspacePage,
});

function WorkspacePage(): ReactElement | null {
  const currentAccount = useCurrentAccount();
  if (currentAccount.isPending) {
    return (
      <main className="p-6">
        <Skeleton lineCount={4} />
      </main>
    );
  }
  if (currentAccount.data === null || currentAccount.data === undefined) {
    return <Navigate to="/login" />;
  }
  /* On chain a listing names its borrower by wallet address, not by the account
     id, so the viewer is identified the same way. Without this a borrower's own
     wallet address never matched their account id, so their own listings fell
     into the browse tab where a lender could offer on them. */
  return (
    <VaultFloor viewerAccountId={currentAccount.data.walletAddress ?? currentAccount.data.id} />
  );
}

function VaultFloor({ viewerAccountId }: { readonly viewerAccountId: string }): ReactElement {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  /* Every pane reads the selection from here. Nothing is mirrored into React
     state, so the back button, a refresh and a pasted link all land on the
     same view without any pane knowing the others exist. */
  function update(next: Partial<WorkspaceSearch>): void {
    void navigate({ search: (previous) => ({ ...previous, ...next }), replace: false });
  }

  const category = search.category ?? '';
  const maxLoanToValue = search.maxLoanToValue === undefined ? '' : String(search.maxLoanToValue);
  const sort = search.sort ?? defaultSort;
  const density = search.density ?? defaultDensity;
  const scope = search.scope ?? 'browse';
  const selectedListingId = search.listing ?? null;

  const browseQuery = useQuery({
    queryKey: marketKeys.browseWith(category, maxLoanToValue, sort),
    queryFn: () =>
      browseListings({
        ...(category === '' ? {} : { category }),
        ...(maxLoanToValue === '' ? {} : { maxLoanToValueBasisPoints: Number(maxLoanToValue) }),
        sort,
      }),
  });

  const myOffersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });

  /* Shares a key with the detail pane, so React Query serves both from one
     request. The route needs it because the spine belongs to the workspace
     rather than to either pane. */
  const selectedQuery = useQuery({
    queryKey: marketKeys.detail(selectedListingId ?? ''),
    queryFn: () => fetchListing(selectedListingId ?? ''),
    enabled: selectedListingId !== null,
    retry: false,
  });

  const myOffers = myOffersQuery.data?.items ?? [];
  const livePendingListingIds = new Set(
    myOffers.filter((offer) => offer.status === 'PENDING').map((offer) => offer.listingId),
  );

  function relationshipFor(listing: ListingSummary): CollateralRelationship {
    return positionOf({
      borrowerAccountId: listing.borrowerAccountId,
      viewerAccountId,
      hasLiveOffer: livePendingListingIds.has(listing.id),
      hasFundedLoan: false,
    }).relationship;
  }

  const selectedDetail = selectedQuery.data;
  const role: MarketRole =
    selectedDetail === undefined
      ? 'lender'
      : positionOf({
          borrowerAccountId: selectedDetail.borrowerAccountId,
          viewerAccountId,
          hasLiveOffer: livePendingListingIds.has(selectedDetail.id),
          hasFundedLoan: false,
        }).role;

  /* Filtered here rather than at the api: the reader's own offers are
     already loaded for the relationship markers, so asking the server again
     would be a second round trip for something the client can already see. */
  const allListings = browseQuery.data?.items ?? [];
  const isMine = (listing: ListingSummary): boolean =>
    listing.borrowerAccountId === viewerAccountId;
  const visibleListings =
    scope === 'offered'
      ? allListings.filter((listing) => livePendingListingIds.has(listing.id))
      : scope === 'listings'
        ? allListings.filter(isMine)
        : /* Browsing is for other people's things. A borrower cannot lend
             against their own item, so leaving them in the lender's tab was
             padding it with rows nobody could act on. */
          allListings.filter((listing) => !isMine(listing));

  /* The ticker shows the browse items: the open listings the reader can lend
     against, their own excluded, each with the keenest rate it has drawn so far
     (its asked maximum until a lender undercuts) and the principal it wants. */
  const tapeItems = allListings
    .filter((listing) => !isMine(listing))
    .map((listing) => ({
      listingId: listing.id,
      itemCategory: listing.itemCategory,
      categoryLabel: nameForCategory(listing.itemCategory),
      itemDescription: listing.itemDescription,
      rateBasisPoints:
        listing.bestOfferRateBasisPoints ?? listing.maxAnnualPercentageRateBasisPoints,
      amount: listing.requestedPrincipal,
    }));

  return (
    <MarketShell fills>
      <Workspace
        browse={
          <BrowsePane
            listings={visibleListings}
            isPending={browseQuery.isPending}
            isError={browseQuery.isError}
            selectedListingId={selectedListingId}
            onSelect={(listingId) => update({ listing: listingId, offer: undefined })}
            relationshipFor={relationshipFor}
            nowEpochMs={Date.now()}
            category={category}
            onCategory={(value) =>
              update({ category: value === '' ? undefined : value, listing: undefined })
            }
            scope={scope}
            onScope={(value) =>
              update({ scope: value === 'browse' ? undefined : value, listing: undefined })
            }
            sort={sort as BrowseSort}
            onSort={(value) => update({ sort: value })}
            density={density as BrowseDensity}
            onDensity={(value) => update({ density: value })}
          />
        }
        detail={
          <DetailPane
            listingId={selectedListingId}
            viewerAccountId={viewerAccountId}
            selectedOfferId={search.offer ?? null}
            onSelectOffer={(offerId) => update({ offer: offerId })}
            role={role}
          />
        }
        spine={
          selectedDetail === undefined ? null : (
            <LifecycleSpine
              role={role}
              stages={spineFor(role, selectedDetail.status, {
                hasLiveOffer: livePendingListingIds.has(selectedDetail.id),
              })}
              onSelectStage={(stage) => update({ stage })}
            />
          )
        }
        tape={
          <Tape
            items={tapeItems}
            selectedListingId={selectedListingId}
            onSelectListing={(listingId) => update({ listing: listingId, offer: undefined })}
          />
        }
      />
    </MarketShell>
  );
}
