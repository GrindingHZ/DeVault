import { issueVaultReceipt, messageForError } from '@depawn/contracts';
import type { IssueVaultReceiptResponse } from '@depawn/contracts';
import { Button, Card, Field, Page, PageHeader } from '@depawn/ui';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/mint')({
  component: MintPage,
});

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type Category = (typeof categories)[number];

/* A USDC amount typed by a person into the coin's base units, six decimal
   places. Null when it is not an amount yet. */
function toBaseUnits(input: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(input.trim());
  if (match === null) {
    return null;
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction)).toString();
}

function MintPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <Page>
          <PageHeader
            title="Register a vault receipt"
            description="Take an item in, appraise it, and mint its receipt on chain to the member's wallet."
          />
          <div className="max-w-md">
            <IssueCard />
          </div>
        </Page>
      </ConsoleShell>
    </StaffGuard>
  );
}

function IssueCard(): ReactElement {
  const [holder, setHolder] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<Category>('BULLION');
  const [amountError, setAmountError] = useState<string | null>(null);

  const issue = useMutation({ mutationFn: issueVaultReceipt });

  return (
    <Card title="On-chain issue">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const appraisedValueBaseUnits = toBaseUnits(value);
          if (appraisedValueBaseUnits === null) {
            setAmountError('Enter an amount like 800 or 800.00.');
            return;
          }
          setAmountError(null);
          issue.mutate({
            holder: holder.trim(),
            receiptKey: `LC-${String(Date.now())}`,
            vault: demoVaultId,
            intakeHash: 'sha256:console',
            appraisedValueBaseUnits,
            itemCategory: category,
            insuranceReference: 'POL-CONSOLE',
          });
        }}
      >
        <Field
          label="Borrower wallet address"
          data-testid="issue-holder"
          value={holder}
          onChange={(event) => setHolder(event.target.value)}
        />
        <Field
          label="Appraised value (USDC)"
          data-testid="issue-value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          errorMessage={amountError ?? undefined}
        />
        <label className="flex flex-col gap-1">
          <span className="font-body text-sm text-ink-secondary">Category</span>
          <select
            data-testid="issue-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="rounded-md border border-edge bg-surface-base px-3 py-2 font-body text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active"
          >
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Button data-testid="issue-submit" type="submit" disabled={issue.isPending}>
          Issue on chain
        </Button>
        {issue.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageForError(issue.error, 'The issue did not go through. Try again.')}
          </p>
        ) : null}
        {issue.isSuccess ? <IssuedReceipt result={issue.data} /> : null}
      </form>
    </Card>
  );
}

function IssuedReceipt({ result }: { readonly result: IssueVaultReceiptResponse }): ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-edge bg-surface-sunken p-3">
      <p className="font-body text-sm text-status-success">Issued on chain and sent to the wallet.</p>
      <a
        href={`https://suiscan.xyz/testnet/object/${result.receiptObjectId}`}
        target="_blank"
        rel="noreferrer"
        data-testid="issued-receipt"
        className="font-mono text-xs text-ink-primary underline"
      >
        receipt {result.receiptObjectId.slice(0, 12)}...
      </a>
      <a
        href={`https://suiscan.xyz/testnet/tx/${result.digest}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-ink-primary underline"
      >
        transaction {result.digest.slice(0, 12)}...
      </a>
    </div>
  );
}
