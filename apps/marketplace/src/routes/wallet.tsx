import { fetchMyListings, fetchMyReceipts } from '@depawn/contracts';
import type { ReceiptResponse } from '@depawn/contracts';
import { Card, Money, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { ActivityLog } from '../wallet/activity-log';
import { formatUsdc } from '../wallet/usdc';
import { useWallet } from '../wallet/use-wallet';

export const Route = createFileRoute('/wallet')({
  component: WalletPage,
});

function WalletPage(): ReactElement | null {
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
          title="Wallet"
          description="Your USDC and your positions, read from the chain."
        />
        <WalletBody />
      </Page>
    </MarketShell>
  );
}

function WalletBody(): ReactElement {
  const wallet = useWallet();

  if (wallet.isPending) {
    return (
      <Card title="Balance">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (wallet.isError || wallet.data === undefined) {
    return (
      <Card title="Balance">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your wallet could not be read from the chain.
        </p>
      </Card>
    );
  }

  const money = wallet.data;
  const decimals = money.decimals;
  const owed = BigInt(money.owedNowBaseUnits);
  const reclaimable = BigInt(money.reclaimableBaseUnits);

  return (
    <>
      <Card title="Balance">
        <div className="flex flex-col gap-1">
          <span className="font-body text-sm text-ink-secondary">Available to spend</span>
          <span
            data-testid="available-balance"
            className="font-figure text-2xl font-semibold tabular-nums text-ink-primary"
          >
            {formatUsdc(BigInt(money.availableBaseUnits), decimals)}
          </span>
        </div>
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
          <Figure
            label="Committed to offers"
            value={formatUsdc(BigInt(money.committedBaseUnits), decimals)}
            note="Locked in offers you have standing. It comes back if an offer is not taken."
          />
          <Figure
            label="Reclaimable"
            value={formatUsdc(reclaimable, decimals)}
            note="In offers that lost or expired. Reclaim it on the offer to return it here."
            tone={reclaimable > 0n ? 'warning' : 'default'}
          />
          <Figure
            label="Ready to collect"
            value={formatUsdc(BigInt(money.collectableBaseUnits), decimals)}
            note="Payoff on loans you funded that have been repaid. Collect it on the loan."
          />
          <Figure
            label="Lent out"
            value={formatUsdc(BigInt(money.lentPrincipalBaseUnits), decimals)}
            note="Principal at work on your active loans."
          />
          <Figure
            label="Interest earned"
            value={formatUsdc(BigInt(money.interestEarnedBaseUnits), decimals)}
            note="Accrued so far on those loans, to this moment."
          />
        </dl>
      </Card>

      {owed > 0n ? (
        <Card title="You owe">
          <div className="flex flex-col gap-1">
            <span className="font-body text-sm text-ink-secondary">Owed today</span>
            <span
              data-testid="owed-balance"
              className="font-figure text-xl font-semibold tabular-nums text-status-warning"
            >
              {formatUsdc(owed, decimals)}
            </span>
            <span className="font-body text-xs text-ink-secondary">
              Across {money.activeBorrowCount} active{' '}
              {money.activeBorrowCount === 1 ? 'loan' : 'loans'}. Repay before the grace cliff to
              keep your item.
            </span>
          </div>
        </Card>
      ) : null}

      <ItemsCard />
      <Card title="On-chain activity">
        <p className="mb-3 font-body text-sm text-ink-secondary">
          Every move you have made on chain, newest first. Open a row for the transaction hash and
          every object it touched, each a link to the Sui explorer.
        </p>
        <ActivityLog />
      </Card>
      <GetUsdcCard />
    </>
  );
}

/* The same receipts My items shows, so an item that is listed or on loan does
   not vanish from here while it is plainly visible a click away. Each carries
   the one word that says where it stands, and the page that acts on them is
   linked rather than duplicated. */
function ItemsCard(): ReactElement {
  const receipts = useQuery({ queryKey: marketKeys.myReceipts, queryFn: fetchMyReceipts });
  const listings = useQuery({ queryKey: marketKeys.myListings, queryFn: fetchMyListings });
  const listedReceiptIds = new Set(
    (listings.data?.items ?? [])
      .filter((listing) => listing.status === 'ACTIVE')
      .map((listing) => listing.receiptId),
  );
  const items = receipts.data?.items ?? [];

  function standingOf(receipt: ReceiptResponse): string {
    if (receipt.status === 'ENCUMBERED') {
      return 'Securing a loan';
    }
    if (listedReceiptIds.has(receipt.id)) {
      return 'Taking offers';
    }
    return 'In the vault';
  }

  return (
    <Card title="Items">
      {receipts.isPending ? (
        <Skeleton lineCount={2} />
      ) : items.length === 0 ? (
        <p className="font-body text-sm text-ink-secondary">No items in your name.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="wallet-items">
          {items.map((receipt) => (
            <li key={receipt.id} className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate font-body text-sm text-ink-primary">
                {receipt.itemDescription}
                <span className="ml-2 font-body text-xs text-ink-secondary">
                  {standingOf(receipt)}
                </span>
              </span>
              <span className="shrink-0 font-figure text-sm tabular-nums text-ink-secondary">
                <Money value={receipt.appraisedValue} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 font-body text-xs text-ink-secondary">
        <Link to="/borrow/receipts" className="text-status-active underline">
          Manage them in My items
        </Link>
      </p>
    </Card>
  );
}

function GetUsdcCard(): ReactElement {
  return (
    <Card title="Get USDC">
      <p className="mb-3 font-body text-sm text-ink-secondary">
        This marketplace settles in Circle's testnet USDC. Get some from Circle's faucet to your
        wallet address, and it appears here.
      </p>
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noreferrer"
        data-testid="get-usdc"
        className="inline-flex items-center rounded-md bg-accent px-4 py-2 font-body text-sm font-semibold text-surface-base transition-colors duration-control ease-enter hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
      >
        Open Circle's faucet
      </a>
    </Card>
  );
}

function Figure({
  label,
  value,
  note,
  tone = 'default',
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone?: 'default' | 'warning';
}): ReactElement {
  return (
    <div className="flex max-w-xs flex-col gap-1">
      <dt className="font-body text-sm text-ink-secondary">{label}</dt>
      <dd
        className={`font-figure text-lg font-semibold tabular-nums ${
          tone === 'warning' ? 'text-status-warning' : 'text-ink-primary'
        }`}
      >
        {value}
      </dd>
      <dd className="font-body text-xs leading-relaxed text-ink-secondary">{note}</dd>
    </div>
  );
}
