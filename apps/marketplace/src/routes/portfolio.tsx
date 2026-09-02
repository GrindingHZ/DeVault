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
import { historyColumns, openBorrowingColumns, openLendingColumns } from '../portfolio/columns';
import { totalsOf } from '../portfolio/portfolio-summary';
import { isOpen } from '../portfolio/position';
import type { Position } from '../portfolio/position';
import { usePositionActions } from '../portfolio/use-position-actions';
import { usePositions } from '../portfolio/use-positions';
import { defaultSide, defaultView, parsePortfolioSearch, sides, views } from '../portfolio-search';
import type { PortfolioSide, PortfolioView } from '../portfolio-search';

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

const viewLabels: Record<PortfolioView, string> = {
  open: 'Open',
  history: 'History',
};

/* Said in the reader's terms, and pointing at the next step rather than
   stopping at the bad news. An empty screen that names what to do about
   itself is the cheapest onboarding there is. */
const whenNothingOpen: Record<PortfolioSide, { readonly title: string; readonly next: string }> = {
  borrowing: {
    title: 'Nothing running',
    next: 'List an item from My items to raise money against it.',
  },
  lending: {
    title: 'Nothing at work',
    next: 'Browse listings to make an offer and put your balance to work.',
  },
};

const whenNoHistory: Record<PortfolioSide, string> = {
  borrowing: 'Anything you have repaid or lost will be kept here.',
  lending: 'Anything you have funded or offered will be kept here once it closes.',
};

function PortfolioBody(): ReactElement {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const side = search.side ?? defaultSide;
  const view = search.view ?? defaultView;
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

  const ofSide = isBorrowing ? positions.borrowing : positions.lending;
  const open = ofSide.filter(isOpen);
  const closed = ofSide.filter((one) => !isOpen(one));
  const rows = view === 'open' ? open : closed;

  const totals = totalsOf({
    loans: isBorrowing ? positions.borrowedLoans : positions.lentLoans,
    positions: ofSide,
    side,
  });
  const currency = totals.currency ?? 'AUD';
  const amount = (minorUnits: bigint): string =>
    formatMoney({ minorUnits: minorUnits.toString(), currency });

  const handlers = { onAct: actOn, openerFor };

  const payoffLoan = positions.borrowedLoans.find(
    (one) => one.id === payoffLoanId && one.status === 'ACTIVE',
  );

  function go(next: { readonly side?: PortfolioSide; readonly view?: PortfolioView }): void {
    void navigate({ to: '/portfolio', search: { side, view, ...next } });
  }

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
          label: 'At maturity',
          value: amount(totals.settlementMinorUnits),
          testId: 'total-settlement',
        },
      ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Portfolio" description={sideDescriptions[side]} />

      {/* Two axes, and they answer different questions: which side of the
          market am I on, and am I looking at what is running or at what is
          behind me. Neither is a filter over one list. The columns differ by
          side, and an open row and a closed one have almost nothing in
          common, which is why one table tried to serve both and ended up
          mostly dashes. */}
      <TabStrip label="Which side">
        {sides.map((one) => (
          <Tab
            key={one}
            label={sideLabels[one]}
            isActive={side === one}
            testId={`side-${one}`}
            onSelect={() => go({ side: one })}
          />
        ))}
      </TabStrip>

      {/* No attention count here. What needs a person is the bell in the
          header, where it is visible from every screen rather than only from
          this one; a second count beside these figures would be a second
          place to check and a second thing to keep in step. */}
      <SummaryStrip figures={figures} />

      {positions.isPending ? (
        <Skeleton lineCount={6} />
      ) : (
        /* No card title. The tabs below are the heading, and repeating
           "History" above a tab that already says it took a line and said
           nothing. */
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TabStrip label="Open or history">
              {views.map((one) => (
                <Tab
                  key={one}
                  label={`${viewLabels[one]} ${one === 'open' ? open.length : closed.length}`}
                  isActive={view === one}
                  testId={`view-${one}`}
                  onSelect={() => go({ view: one })}
                />
              ))}
            </TabStrip>
            {/* The currency, once for the whole table. */}
            <span className="ml-auto font-body text-xs text-ink-secondary">
              {`Amounts in ${currency}`}
            </span>
          </div>

          {positions.unavailable.length === 0 ? null : (
            <p role="alert" className="mb-3 font-body text-sm text-status-danger">
              {`This leaves out ${positions.unavailable.join(' and ')}, which could not be loaded.`}
            </p>
          )}

          <div data-testid={view === 'open' ? 'portfolio-open' : 'portfolio-history'}>
            <DataTable
              columns={
                view === 'history'
                  ? historyColumns(side)
                  : isBorrowing
                    ? openBorrowingColumns(handlers)
                    : openLendingColumns(handlers)
              }
              rows={rows}
              rowKey={(position) => position.id}
              emptyTitle={view === 'open' ? whenNothingOpen[side].title : 'Nothing has closed yet'}
              emptyDescription={view === 'open' ? whenNothingOpen[side].next : whenNoHistory[side]}
            />
          </div>
        </Card>
      )}

      {payoffLoan === undefined ? null : <PayoffCard loan={payoffLoan} />}
    </div>
  );
}
