import { browseNoteSales } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { EmptyState, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { PositionSaleDetail } from '../positions/position-sale-detail';
import { PositionSaleRow } from '../positions/position-sale-row';
import { PurchaseDialog } from '../positions/purchase-dialog';
import { parseSaleSelection } from '../positions/sale-selection';

export const Route = createFileRoute('/secondary-market')({
  validateSearch: parseSaleSelection,
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
   sells positions already funded.

   Items first, chart second. A reader scanning the market is comparing four
   figures down a column; the shape of how a position got to today is the
   question after that one, so it opens on the position they choose. */
function SecondaryMarket({ viewerAccountId }: { readonly viewerAccountId: string }): ReactElement {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  /* A selection that no longer exists, because the position sold while the
     reader was reading it, falls back to nothing selected rather than to an
     empty panel insisting something is there. */
  const selected = sales.find((sale) => sale.id === search.sale) ?? null;

  function select(saleId: string): void {
    void navigate({ search: { sale: saleId === search.sale ? undefined : saleId } });
  }

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
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3" data-testid="sale-list">
              {sales.map((sale) => (
                <PositionSaleRow
                  key={sale.id}
                  sale={sale}
                  isSelected={sale.id === selected?.id}
                  onSelect={() => select(sale.id)}
                />
              ))}
            </div>

            {selected === null ? (
              /* Not a spinner: nothing is loading, the reader simply has not
                 chosen yet. */
              <p
                data-testid="sale-detail-prompt"
                className="rounded-lg border border-dashed border-edge p-6 font-body text-sm text-ink-secondary"
              >
                Choose a position to see what it has earned so far and what is still to come.
              </p>
            ) : (
              <PositionSaleDetail
                sale={selected}
                asOfMs={asOfMs}
                onBuy={() => setBuying(selected)}
              />
            )}
          </div>
        )}

        <PurchaseDialog sale={buying} onClose={() => setBuying(null)} />
      </Page>
    </MarketShell>
  );
}
