import { fetchListings } from '@depawn/contracts';
import type { ListingsResponse } from '@depawn/contracts';
import { EmptyState, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell } from '../market-shell';
import { formatUsdc } from '../wallet/usdc';

export const Route = createFileRoute('/listings/')({
  component: ListingsPage,
});

function ListingsPage(): ReactElement | null {
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
  return (
    <MarketShell>
      <Page>
        <PageHeader
          title="Browse"
          description="Loans people are asking for against items in the vault, read from the chain. Make an offer to fund one."
        />
        <Browse ownAddress={currentAccount.data.walletAddress} />
      </Page>
    </MarketShell>
  );
}

function Browse({ ownAddress }: { readonly ownAddress: string | null }): ReactElement {
  const listingsQuery = useQuery({ queryKey: ['chain', 'listings'], queryFn: fetchListings });

  if (listingsQuery.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="rounded-lg border border-edge bg-surface-raised p-4">
            <Skeleton lineCount={3} />
          </div>
        ))}
      </div>
    );
  }
  if (listingsQuery.isError || listingsQuery.data === undefined) {
    return (
      <p role="alert" className="font-body text-sm text-status-danger">
        The market could not be read from the chain.
      </p>
    );
  }

  /* A borrower cannot fund their own item, so their own listings are left out
     rather than shown as rows nobody in this seat could act on. */
  const listings = listingsQuery.data.listings.filter((listing) => listing.borrower !== ownAddress);

  if (listings.length === 0) {
    return (
      <EmptyState
        title="Nothing is listed right now"
        description="When someone opens a loan against an item, it appears here for you to fund."
      />
    );
  }

  return (
    <div
      data-testid="browse-listings"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {listings.map((listing) => (
        <ListingCard key={listing.pledgeId} listing={listing} decimals={listingsQuery.data.decimals} />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  decimals,
}: {
  readonly listing: ListingsResponse['listings'][number];
  readonly decimals: number;
}): ReactElement {
  const appraised = BigInt(listing.appraisedValueBaseUnits);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <span className="font-body text-sm font-semibold text-ink-primary">{listing.itemCategory}</span>
        <span className="font-figure text-sm tabular-nums text-ink-secondary">
          {(listing.requestedAprBps / 100).toFixed(2)}% APR
        </span>
      </div>
      {appraised > 0n ? (
        <div>
          <span className="font-body text-xs text-ink-secondary">Appraised at </span>
          <span className="font-figure text-lg tabular-nums text-ink-primary">
            {formatUsdc(appraised, decimals)}
          </span>
        </div>
      ) : null}
      <a
        href={`https://suiscan.xyz/testnet/object/${listing.pledgeId}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-status-active underline"
      >
        {listing.pledgeId.slice(0, 10)}...{listing.pledgeId.slice(-6)}
      </a>
    </div>
  );
}
