import {
  claimReceipt,
  fetchMyListings,
  fetchMyLoans,
  fetchMyOffers,
  markLoanDefaulted,
  publishListing,
  reclaimOffer,
  withdrawOffer,
} from '@depawn/contracts';
import {
  Card,
  DataTable,
  Page,
  PageHeader,
  PositionRow,
  Skeleton,
  SummaryStrip,
  formatMoney,
} from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { marketKeys } from '../market-keys';
import { MarketShell, useFeedback } from '../market-shell';
import { PayoffCard } from '../payoff-card';
import { attentionOf } from '../portfolio/attention';
import {
  borrowedLoanColumns,
  lentLoanColumns,
  listingColumns,
  offerColumns,
} from '../portfolio/columns';
import { totalsOf } from '../portfolio/portfolio-summary';
import {
  positionOfBorrowedLoan,
  positionOfLentLoan,
  positionOfListing,
  positionOfOffer,
} from '../portfolio/position';
import type { Position } from '../portfolio/position';
import { defaultSide, parsePortfolioSearch, sides } from '../portfolio-search';
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
        <PortfolioBody />
      </Page>
    </MarketShell>
  );
}

const sideLabels: Record<PortfolioSide, string> = {
  borrowing: 'Borrowing',
  lending: 'Lending',
};

const sideDescriptions: Record<PortfolioSide, string> = {
  borrowing: 'What you have raised against your items, what it is costing, and what is due when.',
  lending: 'What you have put out against other people, what it has earned, and what is at risk.',
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

function byItem(left: Position, right: Position): number {
  return left.itemDescription.localeCompare(right.itemDescription);
}

function PortfolioBody(): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const side = search.side ?? defaultSide;
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

  /* The server's clock, not the browser's. A demo process runs weeks ahead
     (docs/10-flows.md flow 15), so a term bar drawn against `Date.now()`
     would say a matured loan was three percent through. The browser is the
     fallback only while the query is in flight, when there are no loans to
     draw anyway. */
  const borrowedAsOf = Date.parse(borrowedQuery.data?.asOf ?? '') || Date.now();
  const lentAsOf = Date.parse(lentQuery.data?.asOf ?? '') || Date.now();

  const borrowedLoanPositions = borrowedLoans
    .map((loan) => positionOfBorrowedLoan(loan, borrowedAsOf))
    .sort(byItem);
  const lentLoanPositions = lentLoans
    .map((loan) => positionOfLentLoan(loan, lentAsOf))
    .sort(byItem);
  const listingPositions = listings
    .map(positionOfListing)
    .filter((one): one is Position => one !== null)
    .sort(byItem);
  const offerPositions = offers
    .map(positionOfOffer)
    .filter((one): one is Position => one !== null)
    .sort(byItem);

  const everyPosition = [
    ...borrowedLoanPositions,
    ...lentLoanPositions,
    ...listingPositions,
    ...offerPositions,
  ];
  const attention = attentionOf(everyPosition);

  const isBorrowing = side === 'borrowing';
  const loanPositions = isBorrowing ? borrowedLoanPositions : lentLoanPositions;
  const pendingPositions = isBorrowing ? listingPositions : offerPositions;
  const totals = totalsOf({
    loans: isBorrowing ? borrowedLoans : lentLoans,
    /* Not filtered to the side. The band below shows both, because money
       stuck on the other side is still stuck, and a count that disagreed
       with the list beneath it would just look wrong. */
    positions: everyPosition,
    side,
  });
  const currency = totals.currency ?? 'AUD';
  const amount = (minorUnits: bigint): string =>
    formatMoney({ minorUnits: minorUnits.toString(), currency });

  const unavailable = [
    listingsQuery.isError && isBorrowing ? 'your listings' : null,
    offersQuery.isError && !isBorrowing ? 'your offers' : null,
    borrowedQuery.isError && isBorrowing ? 'what you owe' : null,
    lentQuery.isError && !isBorrowing ? 'what you are owed' : null,
  ].filter((one): one is string => one !== null);

  const isPending = isBorrowing
    ? listingsQuery.isPending || borrowedQuery.isPending
    : offersQuery.isPending || lentQuery.isPending;

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

  const handlers = { onAct: actOn, openerFor, currency };

  const payoffLoan = borrowedLoans.find(
    (one) => one.id === payoffLoanId && one.status === 'ACTIVE',
  );

  /* The same three numbers on both sides with opposite signs, named for the
     side reading them. A borrower's cost is a lender's return. */
  const figures = isBorrowing
    ? [
        { label: 'Borrowed', value: amount(totals.principalMinorUnits), testId: 'total-principal' },
        {
          label: 'Interest so far',
          value: amount(totals.interestSoFarMinorUnits),
          testId: 'total-interest-so-far',
        },
        {
          label: 'Interest to come',
          value: amount(totals.interestToComeMinorUnits),
          testId: 'total-interest-to-come',
        },
        {
          label: 'Owed today',
          value: amount(totals.settlementMinorUnits),
          testId: 'total-settlement',
        },
      ]
    : [
        { label: 'Lent', value: amount(totals.principalMinorUnits), testId: 'total-principal' },
        {
          label: 'Earned so far',
          value: amount(totals.interestSoFarMinorUnits),
          testId: 'total-interest-so-far',
        },
        {
          label: 'Still to earn',
          value: amount(totals.interestToComeMinorUnits),
          testId: 'total-interest-to-come',
        },
        {
          label: 'Value at maturity',
          value: amount(totals.settlementMinorUnits),
          testId: 'total-settlement',
        },
      ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Portfolio" description={sideDescriptions[side]} />

      {/* Two screens, not one screen with a filter. The columns below differ
          because the questions differ. */}
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

      <SummaryStrip
        figures={[
          ...figures,
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

      {/* Both sides at once, deliberately. This is the one place that ignores
          the tab: money stuck on the other side is still stuck.

          Nothing at all when it is empty. A band that is quiet most days
          should look quiet, and an empty box reads as something broken. */}
      {attention.length === 0 ? null : (
        <section
          data-testid="attention-band"
          className="rounded-md border border-status-warning bg-surface-raised"
        >
          <h2 className="border-b border-edge px-3 py-2 font-body text-sm font-semibold text-ink-primary">
            Needs you today
          </h2>
          {attention.map((position) => (
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
              needsAttention
            />
          ))}
        </section>
      )}

      {isPending ? (
        <Skeleton lineCount={6} />
      ) : (
        <>
          <Card title={isBorrowing ? 'Loans you are running' : 'Loans you have funded'}>
            <div data-testid="my-loans">
              <DataTable
                columns={isBorrowing ? borrowedLoanColumns(handlers) : lentLoanColumns(handlers)}
                rows={loanPositions}
                rowKey={(position) => position.id}
                emptyTitle={
                  isBorrowing
                    ? 'You have not borrowed against anything yet'
                    : 'You have not funded a loan yet'
                }
              />
            </div>
          </Card>

          <Card title={isBorrowing ? 'Listings waiting for a lender' : 'Offers you have standing'}>
            <div data-testid={isBorrowing ? 'my-listings' : 'my-offers'}>
              <DataTable
                columns={isBorrowing ? listingColumns(handlers) : offerColumns(handlers)}
                rows={pendingPositions}
                rowKey={(position) => position.id}
                emptyTitle={isBorrowing ? 'You have nothing listed' : 'You have no offers standing'}
              />
            </div>
          </Card>
        </>
      )}

      {payoffLoan === undefined ? null : <PayoffCard loan={payoffLoan} />}
    </div>
  );
}
