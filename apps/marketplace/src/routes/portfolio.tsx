import { Card, DataTable, Page, PageHeader, Skeleton, SummaryStrip, Tab, TabStrip } from '@depawn/ui';
import type { WalletResponse } from '@depawn/contracts';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { MarketShell } from '../market-shell';
import { formatUsdc } from '../wallet/usdc';
import { useWallet } from '../wallet/use-wallet';
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
    /* The end to end marker for "a session exists and the product has
       rendered", where signing in lands. */
    <div data-testid="authenticated-home">
      <MarketShell>
        <Page>
          <PortfolioBody />
        </Page>
      </MarketShell>
    </div>
  );
}

const sideLabels: Record<PortfolioSide, string> = { borrowing: 'Borrowing', lending: 'Lending' };

const sideDescriptions: Record<PortfolioSide, string> = {
  borrowing: 'What you have raised against your items, what it is costing, and what is due when.',
  lending: 'What you have put out against other people, what it has earned, and what is at risk.',
};

type LenderRow = WalletResponse['lender'][number];
type BorrowerRow = WalletResponse['borrower'][number];
type OfferRow = WalletResponse['offers'][number];

const statusLabels: Record<string, string> = {
  open: 'Open',
  active: 'Active',
  repaid: 'Repaid',
  defaulted: 'Defaulted',
  committed: 'Committed',
  reclaimable: 'Reclaimable',
  consumed: 'Consumed',
};

function pledgeLink(pledgeId: string): ReactElement {
  return (
    <a
      href={`https://suiscan.xyz/testnet/object/${pledgeId}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-status-active underline"
    >
      {pledgeId.slice(0, 10)}...{pledgeId.slice(-6)}
    </a>
  );
}

function PortfolioBody(): ReactElement {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const side = search.side ?? defaultSide;
  const isBorrowing = side === 'borrowing';
  const wallet = useWallet();

  function go(next: PortfolioSide): void {
    void navigate({ to: '/portfolio', search: { side: next } });
  }

  const header = <PageHeader title="Portfolio" description={sideDescriptions[side]} />;
  const tabs = (
    <TabStrip label="Which side">
      {sides.map((one) => (
        <Tab
          key={one}
          label={sideLabels[one]}
          isActive={side === one}
          testId={`side-${one}`}
          onSelect={() => go(one)}
        />
      ))}
    </TabStrip>
  );

  if (wallet.isPending) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {tabs}
        <Skeleton lineCount={6} />
      </div>
    );
  }
  if (wallet.isError || wallet.data === undefined) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {tabs}
        <p role="alert" className="font-body text-sm text-status-danger">
          Your portfolio could not be read from the chain.
        </p>
      </div>
    );
  }

  const money = wallet.data;
  const decimals = money.decimals;
  const amount = (base: string): string => formatUsdc(BigInt(base), decimals);
  const status = (value: string): string => statusLabels[value] ?? value;

  const figures = isBorrowing
    ? [
        { label: 'Owed today', value: amount(money.owedNowBaseUnits), testId: 'total-settlement' },
        { label: 'Active loans', value: String(money.activeBorrowCount), testId: 'total-count' },
      ]
    : [
        { label: 'Lent', value: amount(money.lentPrincipalBaseUnits), testId: 'total-principal' },
        {
          label: 'Earned so far',
          value: amount(money.interestEarnedBaseUnits),
          testId: 'total-interest-so-far',
        },
        {
          label: 'Ready to collect',
          value: amount(money.collectableBaseUnits),
          testId: 'total-collectable',
        },
      ];

  return (
    <div className="flex flex-col gap-5">
      {header}
      {tabs}
      <SummaryStrip figures={figures} />
      {isBorrowing ? (
        <Card>
          <div data-testid="portfolio-open">
            <DataTable
              columns={[
                { key: 'pledge', header: 'Loan', render: (row: BorrowerRow) => pledgeLink(row.pledgeId) },
                { key: 'owed', header: 'Owed now', render: (row: BorrowerRow) => amount(row.owedNowBaseUnits) },
                {
                  key: 'maturity',
                  header: 'Owed at maturity',
                  render: (row: BorrowerRow) => amount(row.owedAtMaturityBaseUnits),
                },
                {
                  key: 'grace',
                  header: 'Grace ends',
                  render: (row: BorrowerRow) =>
                    row.graceEndsAtMs === 0 ? '-' : new Date(row.graceEndsAtMs).toISOString().slice(0, 10),
                },
                { key: 'status', header: 'Status', render: (row: BorrowerRow) => status(row.status) },
              ]}
              rows={money.borrower}
              rowKey={(row) => row.pledgeId}
              emptyTitle="Nothing running"
              emptyDescription="List an item from My items to raise money against it."
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card title="Loans you funded">
            <div data-testid="portfolio-open">
              <DataTable
                columns={[
                  { key: 'pledge', header: 'Loan', render: (row: LenderRow) => pledgeLink(row.pledgeId) },
                  {
                    key: 'principal',
                    header: 'Principal',
                    render: (row: LenderRow) => amount(row.principalBaseUnits),
                  },
                  {
                    key: 'earned',
                    header: 'Earned so far',
                    render: (row: LenderRow) => amount(row.earnedSoFarBaseUnits),
                  },
                  {
                    key: 'maturity',
                    header: 'At maturity',
                    render: (row: LenderRow) => amount(row.valueAtMaturityBaseUnits),
                  },
                  {
                    key: 'collect',
                    header: 'To collect',
                    render: (row: LenderRow) => amount(row.collectableBaseUnits),
                  },
                  { key: 'status', header: 'Status', render: (row: LenderRow) => status(row.status) },
                ]}
                rows={money.lender}
                rowKey={(row) => row.pledgeId}
                emptyTitle="Nothing at work"
                emptyDescription="Browse listings to make an offer and put your balance to work."
              />
            </div>
          </Card>
          <Card title="Open offers">
            <DataTable
              columns={[
                { key: 'pledge', header: 'On loan', render: (row: OfferRow) => pledgeLink(row.pledgeId) },
                { key: 'amount', header: 'Offered', render: (row: OfferRow) => amount(row.amountBaseUnits) },
                { key: 'status', header: 'Status', render: (row: OfferRow) => status(row.status) },
              ]}
              rows={money.offers.filter((offer) => offer.status !== 'consumed')}
              rowKey={(row) => row.holdObjectId}
              emptyTitle="No open offers"
              emptyDescription="Browse listings to make an offer."
            />
          </Card>
        </div>
      )}
    </div>
  );
}
