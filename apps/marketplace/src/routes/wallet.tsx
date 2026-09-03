import { requestTestnetUsdc } from '@depawn/contracts';
import { Button, Card, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell, useFeedback } from '../market-shell';
import { formatUsdc } from '../wallet/usdc';
import { useWalletMoney } from '../wallet/use-wallet-money';
import type { ReceiptSummary } from '../wallet/chain-objects';

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
          description="Your USDC and your positions, read straight from the chain."
        />
        <WalletBody />
      </Page>
    </MarketShell>
  );
}

function WalletBody(): ReactElement {
  /* Testnet time is real time, so the chain clock and the browser agree; there
     is no demo clock running ahead of the wall clock on a public network. */
  const money = useWalletMoney(Date.now());

  if (!money.hasWallet) {
    return (
      <Card title="Balance">
        <p className="font-body text-sm text-ink-secondary">
          Sign in with a wallet to see your USDC and your positions.
        </p>
      </Card>
    );
  }
  if (money.isLoading) {
    return (
      <Card title="Balance">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (money.isError) {
    return (
      <Card title="Balance">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your wallet could not be read from the chain.
        </p>
      </Card>
    );
  }

  const decimals = money.decimals;
  const owed = money.totals.owedNowBaseUnits;

  return (
    <>
      <Card title="Balance">
        <div className="flex flex-col gap-1">
          <span className="font-body text-sm text-ink-secondary">Available to spend</span>
          <span
            data-testid="available-balance"
            className="font-figure text-2xl font-semibold tabular-nums text-ink-primary"
          >
            {formatUsdc(money.availableBaseUnits, decimals)}
          </span>
        </div>
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
          <Figure
            label="Ready to collect"
            value={formatUsdc(money.totals.collectableBaseUnits, decimals)}
            note="Payoff on loans you funded that have been repaid. Collect it on the loan."
          />
          <Figure
            label="Lent out"
            value={formatUsdc(money.totals.lentPrincipalBaseUnits, decimals)}
            note="Principal at work on your active loans."
          />
          <Figure
            label="Interest earned"
            value={formatUsdc(money.totals.interestEarnedBaseUnits, decimals)}
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
              Across {money.borrower.length} active{' '}
              {money.borrower.length === 1 ? 'loan' : 'loans'}. Repay before the grace cliff to keep
              your item.
            </span>
          </div>
        </Card>
      ) : null}

      <ItemsCard receipts={money.receipts} decimals={decimals} />
      <GetUsdcCard />
    </>
  );
}

function GetUsdcCard(): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const grant = useMutation({
    mutationFn: requestTestnetUsdc,
    onSuccess: async () => {
      feedback.reportSuccess('Testnet USDC is on its way to your wallet.');
      await queryClient.invalidateQueries();
    },
  });

  return (
    <Card title="Get USDC">
      <p className="mb-3 font-body text-sm text-ink-secondary">
        On testnet the operator mints USDC straight to your wallet, so you can lend and borrow
        without funding it yourself.
      </p>
      <Button
        data-testid="get-usdc"
        type="button"
        disabled={grant.isPending}
        onClick={() => grant.mutate()}
      >
        Get testnet USDC
      </Button>
      {grant.isError ? (
        <p role="alert" className="mt-2 font-body text-sm text-status-danger">
          The mint did not go through. Try again.
        </p>
      ) : null}
    </Card>
  );
}

function ItemsCard({
  receipts,
  decimals,
}: {
  readonly receipts: readonly ReceiptSummary[];
  readonly decimals: number;
}): ReactElement {
  return (
    <Card title="Items">
      {receipts.length === 0 ? (
        <p className="font-body text-sm text-ink-secondary">No items in your name.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="wallet-items">
          {receipts.map((receipt) => (
            <li key={receipt.objectId} className="flex items-baseline justify-between gap-4">
              <span className="font-body text-sm text-ink-primary">{receipt.itemCategory}</span>
              <span className="font-figure text-sm tabular-nums text-ink-secondary">
                {formatUsdc(receipt.appraisedValueBaseUnits, decimals)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}): ReactElement {
  return (
    <div className="flex max-w-xs flex-col gap-1">
      <dt className="font-body text-sm text-ink-secondary">{label}</dt>
      <dd className="font-figure text-lg font-semibold tabular-nums text-ink-primary">{value}</dd>
      <dd className="font-body text-xs leading-relaxed text-ink-secondary">{note}</dd>
    </div>
  );
}
