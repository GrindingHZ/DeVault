import { fetchReceiptMetadata, openPledgeAction } from '@depawn/contracts';
import type { WalletResponse } from '@depawn/contracts';
import { Button, EmptyState, Field, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { formatUsdc } from '../wallet/usdc';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';
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
  /* The name and photographs live off chain, keyed by the receipt_key the object
     carries. A receipt issued before this record existed simply has none, and
     the card falls back to its category and value. */
  const metadata = useQuery({
    queryKey: ['chain', 'receipt-metadata', item.receiptKey],
    queryFn: () => fetchReceiptMetadata(item.receiptKey),
    enabled: item.receiptKey !== '',
    retry: false,
  });
  const meta = metadata.data;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-raised p-4">
      {meta === undefined ? (
        <div className="flex aspect-video items-center justify-center rounded-md bg-surface-sunken font-body text-xs text-ink-secondary">
          {item.itemCategory}
        </div>
      ) : (
        <img
          src={meta.mainImage}
          alt={meta.name}
          className="aspect-video w-full rounded-md border border-edge object-cover"
        />
      )}
      <div className="flex flex-col gap-1">
        <span className="font-body text-sm font-semibold text-ink-primary">
          {meta?.name ?? item.itemCategory}
        </span>
        <span className="font-body text-xs text-ink-secondary">{item.itemCategory}</span>
        <span className="font-figure text-lg tabular-nums text-ink-primary">
          {formatUsdc(BigInt(item.appraisedValueBaseUnits), decimals)}
        </span>
      </div>
      {meta === undefined || meta.secondaryImages.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {meta.secondaryImages.map((source, index) => (
            <img
              key={source.slice(0, 24) + String(index)}
              src={source}
              alt={`${meta.name} photograph ${String(index + 2)}`}
              className="h-14 w-14 rounded-md border border-edge object-cover"
            />
          ))}
        </div>
      )}
      <a
        href={`https://suiscan.xyz/testnet/object/${item.objectId}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-ink-secondary underline"
      >
        {item.objectId.slice(0, 10)}...{item.objectId.slice(-6)}
      </a>
      <ListForLoan receiptKey={item.receiptKey} />
    </div>
  );
}

/* Open a loan against the item: the borrower names the rate they are willing to
   pay, and lenders compete on how much they will lend at it. */
function ListForLoan({ receiptKey }: { readonly receiptKey: string }): ReactElement | null {
  const sign = useSponsoredWrite();
  const queryClient = useQueryClient();
  const [rate, setRate] = useState('18');
  const [error, setError] = useState<string | null>(null);

  const list = useMutation({
    mutationFn: () => {
      const percent = Number(rate);
      if (!Number.isFinite(percent) || percent <= 0) {
        return Promise.reject(new Error('Enter a rate like 18.'));
      }
      return sign(() =>
        openPledgeAction({ receiptKey, requestedAprBps: Math.round(percent * 100) }),
      );
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
    },
    onError: (cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'The listing could not be opened.'),
  });

  if (receiptKey === '') {
    return null;
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-edge pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        list.mutate();
      }}
    >
      <Field
        label="Rate you will pay (% p.a.)"
        value={rate}
        onChange={(event) => setRate(event.target.value)}
      />
      <Button type="submit" disabled={list.isPending}>
        List for a loan
      </Button>
      {error === null ? null : (
        <p role="alert" className="font-body text-xs text-status-danger">
          {error}
        </p>
      )}
    </form>
  );
}
