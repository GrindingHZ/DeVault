import {
  Card,
  DataTable,
  Page,
  PageHeader,
  Skeleton,
  SummaryStrip,
  Tab,
  TabStrip,
  formatMoney,
} from '@depawn/ui';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell } from '../market-shell';
import { PayoffCard } from '../payoff-card';
import {
  borrowedLoanColumns,
  lentLoanColumns,
  listingColumns,
  offerColumns,
} from '../portfolio/columns';
import { totalsOf } from '../portfolio/portfolio-summary';
import type { Position } from '../portfolio/position';
import { usePositionActions } from '../portfolio/use-position-actions';
import { usePositions } from '../portfolio/use-positions';
import { defaultSide, parsePortfolioSearch, sides } from '../portfolio-search';
import type { PortfolioSide } from '../portfolio-search';

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
    /* What the end to end suite waits for after a sign in: the marker
       for "a session exists and the product has rendered". It lives
       wherever signing in lands. */
    <div data-testid="authenticated-home">
      <MarketShell>
        <Page>
          <PortfolioBody />
        </Page>
      </MarketShell>
    </div>
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

function PortfolioBody(): ReactElement {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const side = search.side ?? defaultSide;
  const isBorrowing = side === 'borrowing';
  /* Repaying opens a quote below the table rather than on its own screen, so
     a borrower never loses sight of the rest of what they owe. The id rather
     than the loan, so the card reads the same data as the table: once the
     repayment lands the loan is no longer active and the card closes itself
     instead of sitting there quoting a settled debt. */
  const [payoffLoanId, setPayoffLoanId] = useState<string | null>(null);

  const positions = usePositions();

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

  const { actOn } = usePositionActions({
    onRepay: (position) => setPayoffLoanId(position.loanId),
    onOpen: (position) => openerFor(position)?.(),
  });

  const loanPositions = isBorrowing ? positions.borrowedLoanPositions : positions.lentLoanPositions;
  const pendingPositions = isBorrowing ? positions.listingPositions : positions.offerPositions;
  const totals = totalsOf({
    loans: isBorrowing ? positions.borrowedLoans : positions.lentLoans,
    positions: positions.everyPosition.filter((one) => one.side === side),
    side,
  });
  const currency = totals.currency ?? 'AUD';
  const amount = (minorUnits: bigint): string =>
    formatMoney({ minorUnits: minorUnits.toString(), currency });

  const handlers = { onAct: actOn, openerFor, currency };

  const payoffLoan = positions.borrowedLoans.find(
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
      <TabStrip label="Which side">
        {sides.map((one) => (
          <Tab
            key={one}
            label={sideLabels[one]}
            isActive={side === one}
            testId={`side-${one}`}
            onSelect={() => void navigate({ to: '/portfolio', search: { side: one } })}
          />
        ))}
      </TabStrip>

      {/* No attention count here. What needs a person is the bell in the
          header, where it is visible from every screen rather than only from
          this one; a second count beside these figures would be a second
          place to check and a second thing to keep in step. */}
      <SummaryStrip figures={figures} />

      {positions.unavailable.length === 0 ? null : (
        <p role="alert" className="font-body text-sm text-status-danger">
          {`The figures leave out ${positions.unavailable.join(' and ')}, which could not be loaded.`}
        </p>
      )}

      {positions.isPending ? (
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
