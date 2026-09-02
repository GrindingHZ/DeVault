import {
  claimReceipt,
  markLoanDefaulted,
  fetchMyListings,
  fetchMyLoans,
  fetchMyOffers,
  publishListing,
  reclaimOffer,
  withdrawOffer,
} from '@depawn/contracts';
import { Page, PageHeader, PositionRow, Skeleton, SummaryStrip, formatMoney } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell, useFeedback } from '../market-shell';
import { PayoffCard } from '../payoff-card';
import { attentionOf } from '../portfolio/attention';
import { totalsOf } from '../portfolio/portfolio-summary';
import {
  positionOfBorrowedLoan,
  positionOfLentLoan,
  positionOfListing,
  positionOfOffer,
} from '../portfolio/position';
import type { Position } from '../portfolio/position';
import { parsePortfolioSearch, sides } from '../portfolio-search';
import type { PortfolioSide } from '../portfolio-search';
import { walletKeys } from '../wallet-keys';

export const Route = createFileRoute('/portfolio')({
  validateSearch: parsePortfolioSearch,
  component: PortfolioPage,
});

function PortfolioPage(): ReactElement | null {
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
          title="Portfolio"
          description="Everything you hold, on both sides of the market, and what each one is waiting on."
        />
        <PortfolioBody />
      </Page>
    </MarketShell>
  );
}

const sideLabels: Record<PortfolioSide, string> = {
  all: 'Everything',
  borrowing: 'Borrowing',
  lending: 'Lending',
};

function successFor(position: Position): string {
  if (position.action?.kind === 'reclaim') {
    return 'The hold was returned to your balance.';
  }
  if (position.action?.kind === 'publish') {
    return 'The listing is live and taking offers.';
  }
  if (position.action?.kind === 'withdraw') {
    return 'The offer was withdrawn and the hold released.';
  }
  if (position.action?.kind === 'default') {
    return 'The loan is marked defaulted. The collateral is yours to claim.';
  }
  return 'The collateral is yours to collect.';
}

function runAction(position: Position, idempotencyKey: string): Promise<unknown> {
  const options = { idempotencyKey };
  if (position.action?.kind === 'publish' && position.listingId !== null) {
    return publishListing(position.listingId, options);
  }
  if (
    position.action?.kind === 'withdraw' &&
    position.offerId !== null &&
    position.listingId !== null
  ) {
    return withdrawOffer(position.listingId, position.offerId, options);
  }
  if (position.action?.kind === 'reclaim' && position.offerId !== null) {
    return reclaimOffer(position.offerId, options);
  }
  if (position.action?.kind === 'default' && position.loanId !== null) {
    return markLoanDefaulted(position.loanId, options);
  }
  if (position.action?.kind === 'claim' && position.loanId !== null) {
    return claimReceipt(position.loanId, options);
  }
  return Promise.reject(new Error('That position has nothing to act on.'));
}

function PortfolioBody(): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const side = search.side ?? 'all';
  /* Repaying opens a quote below the table rather than on its own screen, so
     a borrower never loses sight of the rest of what they owe. The id rather
     than the loan, so the card reads the same data as the table: once the
     repayment lands the loan is no longer active and the card closes itself
     instead of sitting there quoting a settled debt. */
  const [payoffLoanId, setPayoffLoanId] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const listingsQuery = useQuery({ queryKey: marketKeys.myListings, queryFn: fetchMyListings });
  const offersQuery = useQuery({ queryKey: marketKeys.myOffers, queryFn: fetchMyOffers });
  const borrowedQuery = useQuery({
    queryKey: marketKeys.myLoans('borrower'),
    queryFn: () => fetchMyLoans('borrower'),
  });
  const lentQuery = useQuery({
    queryKey: marketKeys.myLoans('lender'),
    queryFn: () => fetchMyLoans('lender'),
  });

  const act = useMutation({
    mutationFn: (position: Position) => runAction(position, idempotencyKey),
    onSuccess: async (_result, position) => {
      feedback.reportSuccess(successFor(position));
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('borrower') });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
    },
    onError: () => feedback.reportFailure('That could not be completed. Nothing has changed.'),
  });

  /* Each list is read on its own. One failure costs its own rows and says so,
     rather than blanking a screen the reader came to for something else. */
  const listings = listingsQuery.data?.items ?? [];
  const offers = offersQuery.data?.items ?? [];
  const borrowedLoans = borrowedQuery.data?.items ?? [];
  const lentLoans = lentQuery.data?.items ?? [];

  const now = Date.now();
  const positions: readonly Position[] = [
    ...listings.map(positionOfListing),
    ...offers.map(positionOfOffer),
    ...borrowedLoans.map((loan) => positionOfBorrowedLoan(loan, now)),
    ...lentLoans.map((loan) => positionOfLentLoan(loan, now)),
  ]
    .filter((one): one is Position => one !== null)
    /* By item, so a listing and the loan that came out of it sit together and
       a reader can see what belongs to what without hunting.

       Deliberately not urgency first. The band above already leads with what
       is urgent, and sorting the table the same way put the same rows in the
       same order directly underneath it, which read as a rendering fault
       rather than as two views of one list. */
    .sort((left, right) => {
      const byItem = left.itemDescription.localeCompare(right.itemDescription);
      return byItem === 0 ? left.side.localeCompare(right.side) : byItem;
    });

  const totals = totalsOf({ borrowedLoans, lentLoans, positions });
  const currency = totals.currency ?? 'AUD';
  const attention = attentionOf(positions);
  const visible = side === 'all' ? positions : positions.filter((one) => one.side === side);

  const unavailable = [
    listingsQuery.isError ? 'your listings' : null,
    offersQuery.isError ? 'your offers' : null,
    borrowedQuery.isError ? 'what you owe' : null,
    lentQuery.isError ? 'what you are owed' : null,
  ].filter((one): one is string => one !== null);

  const payoffLoan = borrowedLoans.find(
    (one) => one.id === payoffLoanId && one.status === 'ACTIVE',
  );

  const isPending =
    listingsQuery.isPending ||
    offersQuery.isPending ||
    borrowedQuery.isPending ||
    lentQuery.isPending;

  /* Null when the row has nowhere to go, which the row reads as "render no
     control". A lent loan is the case: the collateral is the borrower's until
     it is claimed, and the receipts screen shows only the reader's own. */
  function openerFor(position: Position): (() => void) | undefined {
    const { listingId } = position;
    if (listingId !== null) {
      return () => void navigate({ to: '/listings', search: { listing: listingId } });
    }
    if (position.side === 'borrowing') {
      return () => void navigate({ to: '/borrow/receipts' });
    }
    return undefined;
  }

  function actOn(position: Position): void {
    if (position.action === null) {
      return;
    }
    if (position.action.kind === 'repay') {
      setPayoffLoanId(position.loanId);
      return;
    }
    /* Accepting an offer is a decision made against the book, and collecting
       an item is a visit to a vault. Neither is a button press here. */
    if (position.action.kind === 'accept' || position.action.kind === 'collect') {
      openerFor(position)?.();
      return;
    }
    act.mutate(position);
  }

  function renderRow(position: Position): ReactElement {
    return (
      <PositionRow
        key={position.id}
        itemDescription={position.itemDescription}
        side={position.side}
        stage={position.stage}
        tone={position.tone}
        caption={position.caption}
        figure={position.figure}
        actionLabel={position.action?.label ?? null}
        onAct={() => actOn(position)}
        onOpen={openerFor(position)}
        needsAttention={position.needsAttention}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip
        figures={[
          {
            label: 'Borrowed',
            value: formatMoney({ minorUnits: totals.borrowedMinorUnits.toString(), currency }),
            testId: 'total-borrowed',
          },
          {
            label: 'Owed today',
            value: formatMoney({ minorUnits: totals.owedTodayMinorUnits.toString(), currency }),
            testId: 'total-owed',
          },
          {
            label: 'Lent',
            value: formatMoney({ minorUnits: totals.lentMinorUnits.toString(), currency }),
            testId: 'total-lent',
          },
          {
            label: 'Earned so far',
            value: formatMoney({ minorUnits: totals.accruedMinorUnits.toString(), currency }),
            testId: 'total-earned',
          },
          {
            label: 'Needs you',
            value: totals.needsAttentionCount,
            tone: totals.needsAttentionCount > 0 ? 'attention' : 'plain',
            testId: 'total-attention',
          },
        ]}
      />

      {unavailable.length === 0 ? null : (
        <p role="alert" className="font-body text-sm text-status-danger">
          {`The figures leave out ${unavailable.join(' and ')}, which could not be loaded.`}
        </p>
      )}

      {/* Nothing at all when it is empty. A band that is quiet most days
          should look quiet, and an empty box reads as something broken. */}
      {attention.length === 0 ? null : (
        <section
          data-testid="attention-band"
          className="rounded-md border border-status-warning bg-surface-raised"
        >
          <h2 className="border-b border-edge px-3 py-2 font-body text-sm font-semibold text-ink-primary">
            Needs you today
          </h2>
          {attention.map(renderRow)}
        </section>
      )}

      {/* The tab filters the table and never the strip. A reader on the
          lending side still wants to know what they owe. */}
      <div className="flex gap-1" role="group" aria-label="Which side">
        {sides.map((one) => (
          <button
            key={one}
            type="button"
            aria-pressed={side === one}
            data-testid={`side-${one}`}
            onClick={() => void navigate({ to: '/portfolio', search: { side: one } })}
            className={`rounded-sm border px-3 py-1 font-body text-sm transition-colors duration-control ease-enter focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
              side === one
                ? 'border-status-active text-ink-primary'
                : 'border-edge text-ink-secondary hover:bg-surface-sunken'
            }`}
          >
            {sideLabels[one]}
          </button>
        ))}
      </div>

      {/* Four screens carried these three names. They are one table now, and
          the suite keeps its grip on each of them. */}
      <section
        data-testid="my-listings"
        className="rounded-md border border-edge"
        aria-label="Your positions"
      >
        <div data-testid="my-offers">
          <div data-testid="my-loans">
            {isPending ? (
              <div className="p-3">
                <Skeleton lineCount={5} />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-6 text-center font-body text-sm text-ink-secondary">
                Nothing on this side yet. Anything you list, offer on or fund appears here.
              </p>
            ) : (
              visible.map(renderRow)
            )}
          </div>
        </div>
      </section>

      {payoffLoan === undefined ? null : <PayoffCard loan={payoffLoan} />}
    </div>
  );
}
