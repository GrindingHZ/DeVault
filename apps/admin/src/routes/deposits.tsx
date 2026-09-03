import { ApiError, deposit, messageForError } from '@depawn/contracts';
import { useChainNetwork } from '../use-chain-network';
import {
  Button,
  Card,
  Field,
  Page,
  PageHeader,
  Skeleton,
  toMinorUnits,
  SettlementReference,
} from '@depawn/ui';
import { useMutation } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { AdminShell, useFeedback } from '../admin-shell';

export const Route = createFileRoute('/deposits')({
  component: DepositsPage,
});

function depositMessageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return 'No account exists for this email.';
  }
  return messageForError(error, 'The request failed. Try again.');
}

function DepositsPage(): ReactElement | null {
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
  if (!currentAccount.data.roles.includes('OPERATIONS')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          Deposits require the operations role.
        </p>
      </main>
    );
  }

  return (
    <AdminShell current="/deposits">
      <Page>
        <PageHeader
          title="Deposits"
          description="Credit a member account from the platform float."
        />
        <DepositCard />
      </Page>
    </AdminShell>
  );
}

function DepositCard(): ReactElement {
  const [email, setEmail] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const feedback = useFeedback();
  const network = useChainNetwork();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [lastSettlement, setLastSettlement] = useState<{
    kind: 'ledger' | 'chain';
    reference: string;
  } | null>(null);

  const depositMutation = useMutation({
    mutationFn: (minorUnits: string) =>
      deposit(
        {
          ...(email.trim() === '' ? {} : { email: email.trim() }),
          amount: { minorUnits, currency: 'USD' },
        },
        { idempotencyKey },
      ),
    onSuccess: (response) => {
      feedback.reportSuccess('The deposit landed.');
      setLastSettlement(response.settlementRef);
      setAmountInput('');
      setIdempotencyKey(crypto.randomUUID());
    },
  });

  return (
    <Card title="Deposit funds">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(amountInput);
          if (minorUnits === null) {
            setInputError('Enter an amount like 2500 or 2500.00.');
            return;
          }
          setInputError(null);
          depositMutation.mutate(minorUnits);
        }}
      >
        <Field
          label="Member email"
          type="email"
          data-testid="deposit-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Amount (USD)"
          data-testid="deposit-amount"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Button data-testid="deposit-submit" type="submit" disabled={depositMutation.isPending}>
          Deposit
        </Button>
        {depositMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {depositMessageFor(depositMutation.error)}
          </p>
        ) : null}
        {lastSettlement === null ? null : (
          <p className="font-body text-sm text-ink-secondary">
            Settled with reference <SettlementReference value={lastSettlement} network={network} />
          </p>
        )}
      </form>
    </Card>
  );
}
