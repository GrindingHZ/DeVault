import { browseNoteSales } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { EmptyState, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { PositionSaleCard } from '../positions/position-sale-card';
import { PurchaseDialog } from '../positions/purchase-dialog';

export const Route = createFileRoute('/secondary-market')({
  component: SecondaryMarketPage,
});

function SecondaryMarketPage(): ReactElement {
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
  return <SecondaryMarket viewerAccountId={currentAccount.data.id} />;
}

/* The other market on the rail: Browse sells loans that need funding, this
   sells positions already funded. Its own destination, at the user's
   direction, because it is a different market rather than a different view
   of the reader's own things. */
function SecondaryMarket({ viewerAccountId }: { readonly viewerAccountId: string }): ReactElement {
  const [buying, setBuying] = useState<NoteSaleSummary | null>(null);

  const salesQuery = useQuery({
    queryKey: marketKeys.noteSalesBrowse,
    queryFn: browseNoteSales,
  });

  /* The server's clock, never the browser's: a demo process runs weeks
     ahead, and the today marker has to land on the server's today. */
  const asOfMs = Date.parse(salesQuery.data?.asOf ?? '') || Date.now();
  const sales = (salesQuery.data?.items ?? []).filter(
    /* Browsing is for other people's positions; your own are managed from
       the portfolio, where the withdraw action lives. */
    (sale) => sale.sellerAccountId !== viewerAccountId,
  );

  return (
    <MarketShell>
      <Page>
        <PageHeader
          title="Secondary Market"
          description="Lenders exiting early. The gap between the ask and the value is what a buyer earns on top of the remaining interest."
        />

        {salesQuery.isPending ? (
          <Skeleton lineCount={6} />
        ) : salesQuery.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The market could not be read. Refresh to try again.
          </p>
        ) : sales.length === 0 ? (
          <EmptyState
            title="No positions for sale right now"
            description="A lender who wants an early exit lists their position here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" data-testid="sale-grid">
            {sales.map((sale) => (
              <PositionSaleCard
                key={sale.id}
                sale={sale}
                asOfMs={asOfMs}
                onBuy={() => setBuying(sale)}
              />
            ))}
          </div>
        )}

        <PurchaseDialog sale={buying} onClose={() => setBuying(null)} />
      </Page>
    </MarketShell>
  );
}
