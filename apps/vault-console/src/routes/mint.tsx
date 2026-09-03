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

const maxImageBytes = 4 * 1024 * 1024;

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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function MintPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <Page>
          <PageHeader
            title="Register a vault receipt"
            description="Take an item in, appraise it, photograph it, and mint its receipt on chain to the member's wallet."
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
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<Category>('BULLION');
  const [mainImage, setMainImage] = useState<string | null>(null);
  const [secondaryImages, setSecondaryImages] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const issue = useMutation({ mutationFn: issueVaultReceipt });

  async function onPickMain(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (file === undefined) {
      return;
    }
    if (file.size > maxImageBytes) {
      setFormError('The main photograph is over 4 MB. Use a smaller image.');
      return;
    }
    setFormError(null);
    setMainImage(await readAsDataUrl(file));
  }

  async function onPickSecondary(files: FileList | null): Promise<void> {
    const chosen = Array.from(files ?? []).slice(0, 2);
    if (chosen.some((file) => file.size > maxImageBytes)) {
      setFormError('A photograph is over 4 MB. Use smaller images.');
      return;
    }
    setFormError(null);
    setSecondaryImages(await Promise.all(chosen.map(readAsDataUrl)));
  }

  function onSubmit(): void {
    const appraisedValueBaseUnits = toBaseUnits(value);
    if (appraisedValueBaseUnits === null) {
      setFormError('Enter an amount like 800 or 800.00.');
      return;
    }
    if (name.trim() === '') {
      setFormError('Give the item a name.');
      return;
    }
    if (mainImage === null) {
      setFormError('Add a main photograph of the item.');
      return;
    }
    setFormError(null);
    issue.mutate({
      holder: holder.trim(),
      name: name.trim(),
      vault: demoVaultId,
      appraisedValueBaseUnits,
      itemCategory: category,
      insuranceReference: 'POL-CONSOLE',
      mainImage,
      secondaryImages,
    });
  }

  return (
    <Card title="On-chain issue">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field
          label="Item name"
          data-testid="issue-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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

        <label className="flex flex-col gap-1">
          <span className="font-body text-sm text-ink-secondary">Main photograph</span>
          <input
            type="file"
            accept="image/*"
            data-testid="issue-main-image"
            onChange={(event) => void onPickMain(event.target.files)}
            className="font-body text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:font-body file:text-sm file:text-ink-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body text-sm text-ink-secondary">Extra photographs (up to two)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="issue-secondary-images"
            onChange={(event) => void onPickSecondary(event.target.files)}
            className="font-body text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:font-body file:text-sm file:text-ink-primary"
          />
        </label>

        {mainImage === null && secondaryImages.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            {(mainImage === null ? [] : [mainImage]).concat(secondaryImages).map((source, index) => (
              <img
                key={source.slice(0, 32) + String(index)}
                src={source}
                alt={index === 0 ? 'Main item photograph' : 'Item photograph'}
                className="h-20 w-20 rounded-md border border-edge object-cover"
              />
            ))}
          </div>
        )}

        <Button data-testid="issue-submit" type="submit" disabled={issue.isPending}>
          Issue on chain
        </Button>
        {formError === null ? null : (
          <p role="alert" className="font-body text-sm text-status-danger">
            {formError}
          </p>
        )}
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
