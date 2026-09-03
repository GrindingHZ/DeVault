import {
  cancelPledgeAction,
  fetchMyListings,
  fetchMyReceipts,
  fetchMyRedemptionRequests,
  openPledgeAction,
  redeemAction,
} from '@depawn/contracts';
import type {
  MoneyDto,
  MyListingResponse,
  ReceiptResponse,
  RedemptionRequestResponse,
} from '@depawn/contracts';
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
  formatMoney,
} from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { z } from 'zod';
import { useCurrentAccount } from '../current-account';
import { HoldingDetail } from '../holdings/holding-detail';
import { HoldingTile } from '../holdings/holding-tile';
import { marketKeys } from '../market-keys';
import { MarketShell, useFeedback } from '../market-shell';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';

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
  const feedback = useFeedback();
  const sign = useSponsoredWrite();
  const receiptsQuery = useQuery({ queryKey: marketKeys.myReceipts, queryFn: fetchMyReceipts });
  const redemptionsQuery = useQuery({
    queryKey: marketKeys.myRedemptions,
    queryFn: fetchMyRedemptionRequests,
  });
  /* An item on the market is still the borrower's and still shows here; its
     receipt cannot say so on its own, so the live listing is read alongside to
     mark the item "taking offers" and to send the borrower to the listing
     rather than offer to list it a second time. */
  const listingsQuery = useQuery({ queryKey: marketKeys.myListings, queryFn: fetchMyListings });
  const [listingReceipt, setListingReceipt] = useState<ReceiptResponse | null>(null);

  const redemptionMutation = useMutation({
    mutationFn: (receiptId: string) => sign(() => redeemAction({ receiptKey: receiptId })),
    onSuccess: async () => {
      feedback.reportSuccess('The request is in. Collect it at the counter.');
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myRedemptions });
    },
    onError: () => feedback.reportFailure('The request could not be made. Nothing has changed.'),
  });

  /* Taking a listing down unwraps the receipt back to the wallet, so the item
     returns here free to redeem or list again. The contract refuses it once an
     offer has been accepted, which is why an item securing a loan offers no such
     action. */
  const cancelMutation = useMutation({
    mutationFn: (pledgeId: string) => sign(() => cancelPledgeAction({ pledgeId })),
    onSuccess: async () => {
      feedback.reportSuccess('The listing is off the market. The item is back in your vault.');
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
    },
    onError: () =>
      feedback.reportFailure('The listing could not be taken down. Nothing has changed.'),
  });

  function openItem(receiptId: string | undefined): void {
    void navigate({ search: () => (receiptId === undefined ? {} : { item: receiptId }) });
  }

  const liveListingByReceipt = new Map<string, MyListingResponse>(
    (listingsQuery.data?.items ?? [])
      .filter((listing) => listing.status === 'ACTIVE')
      .map((listing) => [listing.receiptId, listing]),
  );

  /* What a borrower can do with an item, and nothing they cannot. An encumbered
     item is securing a loan and has no action here: it is freed by repaying,
     which the portfolio drives. An item already on the market is not listable
     again, and the way to it is the listing. */
  function actionsFor(receipt: ReceiptResponse): ReactNode {
    if (receipt.status !== 'IN_VAULT') {
      return undefined;
    }
    const listing = liveListingByReceipt.get(receipt.id);
    if (listing !== undefined) {
      return (
        <>
          <Button
            variant="secondary"
            className="whitespace-nowrap"
            data-testid={`view-listing-${receipt.id}`}
            onClick={() => void navigate({ to: '/listings', search: { listing: listing.id } })}
          >
            View listing
          </Button>
          <Button
            variant="secondary"
            className="whitespace-nowrap"
            data-testid={`cancel-listing-${receipt.id}`}
            onClick={() => cancelMutation.mutate(listing.id)}
            disabled={cancelMutation.isPending}
          >
            Take it off the market
          </Button>
        </>
      );
    }
    return (
      <>
        <Button
          variant="secondary"
          data-testid={`list-${receipt.id}`}
          onClick={() => setListingReceipt(receipt)}
        >
          List for a loan
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
    );
  }

  if (receiptsQuery.isPending) {
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

  const currency = receipts[0]?.appraisedValue.currency ?? 'USDC';
  /* Three buckets that add up to the appraisal. An item on the market is not
     free to borrow against, it is already asking, so it gets its own figure
     rather than padding the free one. */
  const securing = receipts.filter((receipt) => receipt.status === 'ENCUMBERED');
  const listed = receipts.filter(
    (receipt) => receipt.status === 'IN_VAULT' && liveListingByReceipt.has(receipt.id),
  );
  const free = receipts.filter(
    (receipt) => receipt.status === 'IN_VAULT' && !liveListingByReceipt.has(receipt.id),
  );

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
            label="Listed for a loan"
            hint={listed.length === 0 ? 'Nothing on the market' : 'Taking offers'}
            value={totalOf(
              listed.map((receipt) => receipt.appraisedValue),
              currency,
            )}
          />
          <Total
            label="Free to borrow against"
            hint={`${String(free.length)} item${free.length === 1 ? '' : 's'} in the vault`}
            value={totalOf(
              free.map((receipt) => receipt.appraisedValue),
              currency,
            )}
          />
        </dl>
      </PageSection>

      <div
        data-testid="my-receipts"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {receipts.map((receipt) => (
          <HoldingTile
            key={receipt.id}
            receipt={receipt}
            redemption={redemptionByReceipt.get(receipt.id)}
            listingStatus={liveListingByReceipt.get(receipt.id)?.status ?? null}
            onOpen={openItem}
            actions={actionsFor(receipt)}
          />
        ))}
      </div>

      {opened === undefined ? null : (
        <HoldingDetail
          receipt={opened}
          redemption={redemptionByReceipt.get(opened.id)}
          listing={liveListingByReceipt.get(opened.id)}
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

/* Listing in self-custody is a single signed move: the borrower names the rate
   they will pay and lenders compete on how much to lend, up to the item's
   category ceiling. There is no principal or duration to set here, so the
   dialog is one field. The receipt is wrapped into a shared pledge, so the item
   leaves the wallet and this screen begins reading it back as "taking offers"
   from its listing. */
function ListReceiptDialog({
  receipt,
  onClose,
}: {
  readonly receipt: ReceiptResponse;
  readonly onClose: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const sign = useSponsoredWrite();

  const currency = receipt.appraisedValue.currency;
  /* The ceiling the contract enforces at open: a share of the appraised value,
     set by the item's category. The borrower cannot ask for more. */
  const ceilingMinorUnits =
    (BigInt(receipt.appraisedValue.minorUnits) *
      BigInt(receipt.categoryMaxLoanToValueBasisPoints)) /
    10_000n;
  const ceilingMoney = { minorUnits: ceilingMinorUnits.toString(), currency };

  const [principalInput, setPrincipalInput] = useState(() =>
    (Number(ceilingMinorUnits) / 100).toFixed(2),
  );
  const [rateInput, setRateInput] = useState('24.00');
  const [inputError, setInputError] = useState<string | null>(null);

  const listMutation = useMutation({
    mutationFn: () => {
      const dollars = Number(principalInput);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return Promise.reject(new Error('Enter how much you want to borrow.'));
      }
      const principalMinorUnits = BigInt(Math.round(dollars * 100));
      if (principalMinorUnits > ceilingMinorUnits) {
        return Promise.reject(
          new Error(`You can borrow up to ${formatMoney(ceilingMoney)} against this item.`),
        );
      }
      const percent = Number(rateInput);
      if (!Number.isFinite(percent) || percent <= 0) {
        return Promise.reject(new Error('Enter the most you will pay, like 24.'));
      }
      return sign(() =>
        openPledgeAction({
          receiptKey: receipt.id,
          /* Cents to the settlement coin's base units. */
          requestedPrincipalBaseUnits: (principalMinorUnits * 10_000n).toString(),
          requestedAprBps: Math.round(percent * 100),
        }),
      );
    },
    onSuccess: async () => {
      feedback.reportSuccess('The item is listed and taking offers.');
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
      onClose();
    },
    onError: (error) =>
      setInputError(error instanceof Error ? error.message : 'The listing could not be opened.'),
  });

  return (
    <Dialog title="List this item for a loan" isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setInputError(null);
          listMutation.mutate();
        }}
      >
        <p className="font-body text-sm text-ink-secondary">
          {receipt.itemDescription} is appraised at <Money value={receipt.appraisedValue} />. You
          can borrow up to {receipt.categoryMaxLoanToValueBasisPoints / 100}% of that,{' '}
          <Money value={ceilingMoney} />. Lenders then compete to fund it by offering a lower rate
          than the most you will pay.
        </p>
        <Field
          label={`How much to borrow (up to ${formatMoney(ceilingMoney)})`}
          value={principalInput}
          onChange={(event) => setPrincipalInput(event.target.value)}
        />
        <Field
          label="Most you will pay (% p.a.)"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
        />
        {inputError === null ? null : (
          <p role="alert" className="font-body text-sm text-status-danger">
            {inputError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={listMutation.isPending}>
            List for a loan
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
