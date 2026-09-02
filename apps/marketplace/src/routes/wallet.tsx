import {
  ApiError,
  fetchBalance,
  fetchLedgerEntries,
  messageForError,
  nameForBalancePurpose,
  nameForEntryDirection,
  nameForLedgerKind,
  withdraw,
} from '@depawn/contracts';
import type { LedgerEntryResponse } from '@depawn/contracts';
import {
  Button,
  Card,
  DataTable,
  DateTime,
  Explain,
  Field,
  Money,
  Page,
  PageHeader,
  Skeleton,
  toMinorUnits,
} from '@depawn/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { currentAccountKeys, useCurrentAccount } from '../current-account';
import { MarketShell, useFeedback } from '../market-shell';
import { walletKeys } from '../wallet-keys';

export const Route = createFileRoute('/wallet')({
  component: WalletPage,
});

function withdrawalMessageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INSUFFICIENT_FUNDS') {
    return 'The available balance is below the requested amount.';
  }
  return messageForError(error, 'The request failed. Try again.');
}

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
          description="What you can spend, what is committed to offers, and every movement so far."
        />
        <BalanceCards />
        <WithdrawCard />
        <HistoryCard />
      </Page>
    </MarketShell>
  );
}

function BalanceCards(): ReactElement {
  const balanceQuery = useQuery({ queryKey: walletKeys.balance, queryFn: fetchBalance });

  return (
    <Card title="Balance">
      {balanceQuery.isPending ? (
        <Skeleton lineCount={2} />
      ) : balanceQuery.isError || balanceQuery.data === undefined ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          The balance could not be loaded.
        </p>
      ) : (
        <dl className="flex gap-10">
          <div>
            <dt className="font-body text-sm text-ink-secondary">Available</dt>
            <dd
              data-testid="available-balance"
              className="font-figure text-lg font-semibold tabular-nums"
            >
              <Money value={balanceQuery.data.available} />
            </dd>
            <dd className="mt-0.5 font-body text-xs text-ink-secondary">
              Yours to offer or withdraw
            </dd>
          </div>
          <div>
            <dt className="flex items-center font-body text-sm text-ink-secondary">
              Held for offers
              <Explain termId="heldFunds" audience="lender" />
            </dt>
            <dd data-testid="held-balance" className="font-figure text-lg tabular-nums">
              <Money value={balanceQuery.data.held} />
            </dd>
            <dd className="mt-0.5 font-body text-xs text-ink-secondary">
              Still yours, committed to offers you have placed
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function WithdrawCard(): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [amountInput, setAmountInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  // Generated on mount, not on submit, so a double click sends the same key
  // twice and the server deduplicates (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const withdrawMutation = useMutation({
    mutationFn: (minorUnits: string) =>
      withdraw({ amount: { minorUnits, currency: 'AUD' } }, { idempotencyKey }),
    onSuccess: async () => {
      feedback.reportSuccess('The withdrawal went through.');
      setAmountInput('');
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
    },
  });

  return (
    <Card title="Withdraw">
      <form
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(amountInput);
          if (minorUnits === null) {
            setInputError('Enter an amount like 25 or 25.00.');
            return;
          }
          setInputError(null);
          withdrawMutation.mutate(minorUnits);
        }}
      >
        <Field
          label="Amount (AUD)"
          data-testid="withdraw-amount"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Button data-testid="withdraw-submit" type="submit" disabled={withdrawMutation.isPending}>
          Withdraw
        </Button>
      </form>
      {withdrawMutation.isError ? (
        <p role="alert" className="mt-2 font-body text-sm text-status-danger">
          {withdrawalMessageFor(withdrawMutation.error)}
        </p>
      ) : null}
    </Card>
  );
}

function HistoryCard(): ReactElement {
  const entriesQuery = useInfiniteQuery({
    queryKey: walletKeys.entries,
    queryFn: ({ pageParam }) => fetchLedgerEntries(pageParam ?? undefined, 25),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  if (entriesQuery.isPending) {
    return (
      <Card title="History">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (entriesQuery.isError || entriesQuery.data === undefined) {
    return (
      <Card title="History">
        <p role="alert" className="font-body text-sm text-status-danger">
          The ledger history could not be loaded.
        </p>
      </Card>
    );
  }

  const entries = entriesQuery.data.pages.flatMap((page) => page.items);

  return (
    <Card title="History">
      <div data-testid="ledger-history">
        <DataTable
          columns={[
            {
              key: 'occurredAt',
              header: 'When',
              render: (entry: LedgerEntryResponse) => <DateTime iso={entry.occurredAt} />,
            },
            /* HOLD_FUNDS and DEBIT are the right names for a ledger and the
               wrong ones for somebody looking at their own money. */
            {
              key: 'kind',
              header: 'What happened',
              render: (entry: LedgerEntryResponse) => nameForLedgerKind(entry.kind),
            },
            /* A hold moves money between the reader's own two balances, so
               it is two entries with the same amount. Naming the balance is
               what stops that reading as the money moving twice. */
            {
              key: 'purpose',
              header: 'Balance',
              render: (entry: LedgerEntryResponse) => nameForBalancePurpose(entry.purpose),
            },
            {
              key: 'direction',
              header: 'Direction',
              render: (entry: LedgerEntryResponse) => nameForEntryDirection(entry.direction),
            },
            {
              key: 'amount',
              header: 'Amount',
              render: (entry: LedgerEntryResponse) => <Money value={entry.amount} />,
            },
            {
              key: 'reference',
              header: 'Reference',
              /* The proof the movement happened, which becomes a chain
                 digest in Phase 3. Shortened for the same reason as a
                 receipt reference, and whole in the title. */
              render: (entry: LedgerEntryResponse) => (
                <span title={entry.reference} className="font-mono text-xs text-ink-secondary">
                  {entry.reference.slice(-8).toUpperCase()}
                </span>
              ),
            },
          ]}
          rows={entries}
          rowKey={(entry) => entry.id}
          emptyTitle="No movements yet"
        />
      </div>
      {entriesQuery.hasNextPage ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => void entriesQuery.fetchNextPage()}
            disabled={entriesQuery.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
