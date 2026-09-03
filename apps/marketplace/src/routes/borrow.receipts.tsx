import type { WalletResponse } from '@depawn/contracts';
import { EmptyState, Page, PageHeader, Skeleton } from '@depawn/ui';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell } from '../market-shell';
import { formatUsdc } from '../wallet/usdc';
import { useWallet } from '../wallet/use-wallet';

export const Route = createFileRoute('/borrow/receipts')({
  component: BorrowReceiptsPage,
});

function BorrowReceiptsPage(): ReactElement | null {
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
          title="My items"
          description="The receipts the vault has issued to your wallet, read from the chain."
        />
        <Holdings />
      </Page>
    </MarketShell>
  );
}

function Holdings(): ReactElement {
  const wallet = useWallet();

  if (wallet.isPending) {
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
  if (wallet.isError || wallet.data === undefined) {
    return (
      <p role="alert" className="font-body text-sm text-status-danger">
        Your items could not be read from the chain.
      </p>
    );
  }

  const money = wallet.data;
  const items = money.items;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing in the vault yet"
        description="Bring an item to a vault. Once staff appraise it and take custody, its receipt is minted to your wallet and appears here."
      />
    );
  }

  const appraised = items.reduce((total, item) => total + BigInt(item.appraisedValueBaseUnits), 0n);

  return (
    <>
      <dl className="flex flex-wrap gap-8 border-b border-edge pb-4">
        <div>
          <dt className="font-body text-xs text-ink-secondary">Appraised</dt>
          <dd className="mt-1 font-figure text-lg tabular-nums text-ink-primary">
            {formatUsdc(appraised, money.decimals)}
          </dd>
          <dd className="mt-0.5 font-body text-xs text-ink-secondary">
            Across {items.length} {items.length === 1 ? 'item' : 'items'}, free to borrow against
          </dd>
        </div>
      </dl>

      <div
        data-testid="my-receipts"
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {items.map((item) => (
          <ReceiptCard key={item.objectId} item={item} decimals={money.decimals} />
        ))}
      </div>
    </>
  );
}

function ReceiptCard({
  item,
  decimals,
}: {
  readonly item: WalletResponse['items'][number];
  readonly decimals: number;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-surface-raised p-4">
      <span className="font-body text-sm font-semibold text-ink-primary">{item.itemCategory}</span>
      <span className="font-figure text-lg tabular-nums text-ink-primary">
        {formatUsdc(BigInt(item.appraisedValueBaseUnits), decimals)}
      </span>
      <a
        href={`https://suiscan.xyz/testnet/object/${item.objectId}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-ink-secondary underline"
      >
        {item.objectId.slice(0, 10)}...{item.objectId.slice(-6)}
      </a>
    </div>
  );
}
