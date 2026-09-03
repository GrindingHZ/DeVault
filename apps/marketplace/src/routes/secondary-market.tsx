import { browseNoteSales, fetchMyNoteSales } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { EmptyState, Page, PageHeader, Skeleton, Tab, TabStrip } from '@depawn/ui';
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
import { defaultScope, parseSaleSelection } from '../positions/sale-selection';
import type { SaleScope } from '../positions/sale-selection';

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
  /* Identified by wallet address, because a note sale on chain names its seller
     by address; the account id would never match, hiding nothing the seller
     owns from their own browse. */
  return (
    <SecondaryMarket viewerAccountId={currentAccount.data.walletAddress ?? currentAccount.data.id} />
  );
}

const scopes: readonly { readonly value: SaleScope; readonly label: string }[] = [
  { value: 'market', label: 'For sale' },
  { value: 'mine', label: 'My positions' },
];

/* Said in the reader's terms, and pointing at the next step rather than
   stopping at the bad news. */
const nothingHere: Record<SaleScope, { readonly title: string; readonly description: string }> = {
  market: {
    title: 'No positions for sale right now',
    description: 'A lender who wants an early exit lists their position here.',
  },
  mine: {
    title: 'You have not listed a position',
    description: 'Sell a position from your portfolio to put it on this market.',
  },
};

/* The other market on the rail: Browse sells loans that need funding, this
   sells positions already funded.

   Items first, chart second. A reader scanning the market is comparing four
   figures down a column; the shape of how a position got to today is the
   question after that one, so it opens on the position they choose. */
function SecondaryMarket({ viewerAccountId }: { readonly viewerAccountId: string }): ReactElement {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [buying, setBuying] = useState<NoteSaleSummary | null>(null);
  const scope = search.scope ?? defaultScope;

  const marketQuery = useQuery({
    queryKey: marketKeys.noteSalesBrowse,
    queryFn: browseNoteSales,
  });
  /* Both are read whichever tab is showing, because the counts on the tabs
     have to be right before a reader presses one. React Query dedupes by
     key, so the portfolio reading the same list costs nothing extra. */
  const mineQuery = useQuery({ queryKey: marketKeys.myNoteSales, queryFn: fetchMyNoteSales });

  const salesQuery = scope === 'mine' ? mineQuery : marketQuery;
  /* The server's clock, never the browser's: a demo process runs weeks
     ahead, and the today marker has to land on the server's today. */
  const asOfMs = Date.parse(salesQuery.data?.asOf ?? '') || Date.now();
  const onMarket = (marketQuery.data?.items ?? []).filter(
    /* The market is for other people's positions; the reader's own are one
       press away rather than mixed in with things they can buy. */
    (sale) => sale.sellerAccountId !== viewerAccountId,
  );
  const mine = mineQuery.data?.items ?? [];
  const sales = scope === 'mine' ? mine : onMarket;
  const counts: Record<SaleScope, number> = { market: onMarket.length, mine: mine.length };
  /* A selection that no longer exists, because the position sold while the
     reader was reading it, falls back to nothing selected rather than to an
     empty panel insisting something is there. */
  const selected = sales.find((sale) => sale.id === search.sale) ?? null;

  function select(saleId: string): void {
    void navigate({
      search: { scope: search.scope, sale: saleId === search.sale ? undefined : saleId },
    });
  }

  function go(next: SaleScope): void {
    /* The selection is dropped with the tab: a position chosen on one list
       is not on the other, and a panel describing something the reader can
       no longer see is worse than no panel. */
    void navigate({ search: { scope: next === defaultScope ? undefined : next } });
  }

  return (
    <MarketShell>
      <Page>
        <PageHeader
          title="Secondary Market"
          description="Lenders exiting early. The gap between the ask and the value is what a buyer earns on top of the remaining interest."
        />

        <TabStrip label="Which positions">
          {scopes.map((one) => (
            <Tab
              key={one.value}
              label={`${one.label} ${String(counts[one.value])}`}
              isActive={scope === one.value}
              testId={`sale-scope-${one.value}`}
              onSelect={() => go(one.value)}
            />
          ))}
        </TabStrip>

        {salesQuery.isPending ? (
          <Skeleton lineCount={6} />
        ) : salesQuery.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The market could not be read. Refresh to try again.
          </p>
        ) : sales.length === 0 ? (
          <EmptyState
            title={nothingHere[scope].title}
            description={nothingHere[scope].description}
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
                  showsStatus={scope === 'mine'}
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
                /* Nobody buys their own position, and a settled one is not
                   on the market at all. */
                onBuy={scope === 'mine' ? null : () => setBuying(selected)}
              />
            )}
          </div>
        )}

        <PurchaseDialog sale={buying} onClose={() => setBuying(null)} />
      </Page>
    </MarketShell>
  );
}
