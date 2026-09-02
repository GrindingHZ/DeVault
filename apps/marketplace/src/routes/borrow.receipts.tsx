import {
  ApiError,
  createListing,
  fetchMyReceipts,
  fetchMyRedemptionRequests,
  messageForError,
  publishListing,
  requestRedemption,
} from '@depawn/contracts';
import type { MoneyDto, ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Money,
  Page,
  PageHeader,
  PageSection,
  Skeleton,
  toMinorUnits,
} from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { useCurrentAccount } from '../current-account';
import { HoldingDetail } from '../holdings/holding-detail';
import { HoldingTile } from '../holdings/holding-tile';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';

/* Which item the reader has opened, in the URL rather than in React state, so
   the back button closes the record and a link opens on it. */
const receiptsSearchSchema = z.object({ item: z.string().min(1).optional() });

export const Route = createFileRoute('/borrow/receipts')({
  validateSearch: (input: Record<string, unknown>) => {
    const parsed = receiptsSearchSchema.safeParse(input);
    return parsed.success ? parsed.data : {};
  },
  component: BorrowReceiptsPage,
});

const receiptKeys = marketKeys;

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
          description="What the vault is holding for you, and what you can do with each one."
        />
        <Holdings />
      </Page>
    </MarketShell>
  );
}

function redemptionMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RECEIPT_ENCUMBERED') {
      return 'Repay the loan before asking for the item back.';
    }
    if (error.code === 'RECEIPT_ALREADY_BURNED') {
      return 'This item has already been requested.';
    }
  }
  return messageForError(error, 'The request could not be made.');
}

/* Money is minor units in a string, so the sum is bigint and never a float. */
function totalOf(values: readonly MoneyDto[], currency: string): MoneyDto {
  const minorUnits = values
    .filter((value) => value.currency === currency)
    .reduce((running, value) => running + BigInt(value.minorUnits), 0n);
  return { minorUnits: minorUnits.toString(), currency };
}

function Holdings(): ReactElement {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const receiptsQuery = useQuery({ queryKey: receiptKeys.myReceipts, queryFn: fetchMyReceipts });
  const redemptionsQuery = useQuery({
    queryKey: receiptKeys.myRedemptions,
    queryFn: fetchMyRedemptionRequests,
  });
  const [listingReceipt, setListingReceipt] = useState<ReceiptResponse | null>(null);
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [redemptionKey, setRedemptionKey] = useState(() => crypto.randomUUID());

  const redemptionMutation = useMutation({
    mutationFn: (receiptId: string) =>
      requestRedemption(receiptId, { idempotencyKey: redemptionKey }),
    onSuccess: async () => {
      setRedemptionKey(crypto.randomUUID());
      setRedemptionError(null);
      await queryClient.invalidateQueries({ queryKey: receiptKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: receiptKeys.myRedemptions });
    },
    onError: (error) => setRedemptionError(redemptionMessageFor(error)),
  });

  function openItem(receiptId: string | undefined): void {
    void navigate({ search: () => (receiptId === undefined ? {} : { item: receiptId }) });
  }

  if (receiptsQuery.isPending) {
    /* A skeleton in the shape of the answer, never a spinner
       (docs/DESIGN-BRIEF.md rule 5). */
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="rounded-lg border border-edge bg-surface-raised p-3">
            <div className="mb-3 h-36 rounded-md bg-surface-sunken" />
            <Skeleton lineCount={3} />
          </div>
        ))}
      </div>
    );
  }
  if (receiptsQuery.isError || receiptsQuery.data === undefined) {
    return (
      <p role="alert" className="font-body text-sm text-status-danger">
        Your items could not be loaded.
      </p>
    );
  }

  const receipts = receiptsQuery.data.items;
  const redemptionByReceipt = new Map<string, RedemptionRequestResponse>(
    (redemptionsQuery.data?.items ?? []).map((item) => [item.receiptId, item]),
  );
  const opened = receipts.find((receipt) => receipt.id === search.item);

  if (receipts.length === 0) {
    return (
      <EmptyState
        title="Nothing in the vault yet"
        description="Bring an item to a vault. Once staff have appraised it and taken custody, it appears here and you can borrow against it."
      />
    );
  }

  const currency = receipts[0]?.appraisedValue.currency ?? 'AUD';
  const inVault = receipts.filter((receipt) => receipt.status === 'IN_VAULT');
  const securing = receipts.filter((receipt) => receipt.status === 'ENCUMBERED');

  return (
    <>
      <PageSection>
        <dl className="flex flex-wrap gap-8 border-b border-edge pb-4">
          <Total
            label="Appraised"
            hint={`Across ${String(receipts.length)} item${receipts.length === 1 ? '' : 's'}`}
            value={totalOf(
              receipts.map((receipt) => receipt.appraisedValue),
              currency,
            )}
          />
          <Total
            label="Securing loans"
            hint={securing.length === 0 ? 'Nothing pledged' : 'Pledged until settled'}
            tone={securing.length === 0 ? 'default' : 'warning'}
            value={totalOf(
              securing.map((receipt) => receipt.appraisedValue),
              currency,
            )}
          />
          <Total
            label="Free to borrow against"
            hint={`${String(inVault.length)} item${inVault.length === 1 ? '' : 's'} in the vault`}
            value={totalOf(
              inVault.map((receipt) => receipt.appraisedValue),
              currency,
            )}
          />
        </dl>
      </PageSection>

      {redemptionError === null ? null : (
        <p role="alert" className="font-body text-sm text-status-danger">
          {redemptionError}
        </p>
      )}

      <div
        data-testid="my-receipts"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {receipts.map((receipt) => (
          <HoldingTile
            key={receipt.id}
            receipt={receipt}
            redemption={redemptionByReceipt.get(receipt.id)}
            onOpen={openItem}
            actions={
              receipt.status === 'IN_VAULT' ? (
                <>
                  <Button
                    variant="secondary"
                    data-testid={`list-${receipt.id}`}
                    onClick={() => setListingReceipt(receipt)}
                  >
                    List
                  </Button>
                  <Button
                    variant="secondary"
                    className="whitespace-nowrap"
                    data-testid={`redeem-${receipt.id}`}
                    onClick={() => redemptionMutation.mutate(receipt.id)}
                    disabled={redemptionMutation.isPending}
                  >
                    Ask for it back
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>

      {opened === undefined ? null : (
        <HoldingDetail
          receipt={opened}
          redemption={redemptionByReceipt.get(opened.id)}
          onClose={() => openItem(undefined)}
        />
      )}

      {listingReceipt === null ? null : (
        <ListReceiptDialog receipt={listingReceipt} onClose={() => setListingReceipt(null)} />
      )}
    </>
  );
}

function Total({
  label,
  hint,
  value,
  tone,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: MoneyDto;
  readonly tone?: 'default' | 'warning';
}): ReactElement {
  return (
    <div>
      <dt className="font-body text-xs text-ink-secondary">{label}</dt>
      <dd
        className={`mt-1 font-figure text-lg tabular-nums ${
          tone === 'warning' ? 'text-status-warning' : 'text-ink-primary'
        }`}
      >
        <Money value={value} />
      </dd>
      <dd className="mt-0.5 font-body text-xs text-ink-secondary">{hint}</dd>
    </div>
  );
}

/* How long the listing stays open for offers. Sent as a duration so the
   server dates it from its own clock; a date computed here would be wrong
   whenever the two clocks disagree. */
const listingLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function listMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The requested principal is above the lending ceiling for this item.';
    }
    if (error.code === 'RECEIPT_ALREADY_LISTED') {
      return 'This receipt already has a live listing.';
    }
  }
  return messageForError(error, 'The listing could not be created.');
}

function ListReceiptDialog({
  receipt,
  onClose,
}: {
  readonly receipt: ReceiptResponse;
  readonly onClose: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [principalInput, setPrincipalInput] = useState('');
  const [maxRateInput, setMaxRateInput] = useState('24.00');
  const [durationDaysInput, setDurationDaysInput] = useState('30');
  const [inputError, setInputError] = useState<string | null>(null);
  // Both steps carry keys generated when the dialog mounts, so a double
  // click or a retry after a network blip replays instead of duplicating
  // (docs/05-frontend.md).
  const [createKey] = useState(() => crypto.randomUUID());
  const [publishKey] = useState(() => crypto.randomUUID());

  const listMutation = useMutation({
    mutationFn: async (input: {
      minorUnits: string;
      maxRateBasisPoints: number;
      durationDays: number;
    }) => {
      const listing = await createListing(
        {
          receiptId: receipt.id,
          requestedPrincipal: { minorUnits: input.minorUnits, currency: 'AUD' },
          maxAnnualPercentageRateBasisPoints: input.maxRateBasisPoints,
          requestedDurationMs: input.durationDays * 24 * 60 * 60 * 1000,
          requestedLifetimeMs: listingLifetimeMs,
        },
        { idempotencyKey: createKey },
      );
      return publishListing(listing.id, { idempotencyKey: publishKey });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
      onClose();
      await navigate({ to: '/portfolio', search: { side: 'borrowing' } });
    },
  });

  return (
    <Dialog title="List this receipt" isOpen onClose={onClose}>
      <p className="mb-4 font-body text-sm text-ink-secondary">
        {receipt.itemDescription}, appraised at <Money value={receipt.appraisedValue} />.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(principalInput);
          const rate = toMinorUnits(maxRateInput);
          const durationDays = Number(durationDaysInput);
          if (minorUnits === null || rate === null || !Number.isInteger(durationDays)) {
            setInputError('Check the principal, rate, and duration.');
            return;
          }
          setInputError(null);
          listMutation.mutate({
            minorUnits,
            maxRateBasisPoints: Number(rate),
            durationDays,
          });
        }}
      >
        <Field
          label="Requested principal (AUD)"
          data-testid="list-principal"
          value={principalInput}
          onChange={(event) => setPrincipalInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Field
          label="Maximum rate (% per year)"
          data-testid="list-max-rate"
          value={maxRateInput}
          onChange={(event) => setMaxRateInput(event.target.value)}
        />
        <Field
          label="Duration (days)"
          data-testid="list-duration"
          value={durationDaysInput}
          onChange={(event) => setDurationDaysInput(event.target.value)}
        />
        <Button data-testid="list-submit" type="submit" disabled={listMutation.isPending}>
          List and publish
        </Button>
        {listMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {listMessageFor(listMutation.error)}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
