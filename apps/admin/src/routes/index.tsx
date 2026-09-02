import {
  fetchDeadLetters,
  fetchExposureByVault,
  fetchLatestReconciliation,
  fetchLoanBook,
  fetchRequestMetrics,
  fetchSystemState,
} from '@depawn/contracts';
import {
  Card,
  DateTime,
  Money,
  Page,
  PageHeader,
  Percentage,
  Skeleton,
  StatusBadge,
} from '@depawn/ui';
import type { StatusTone } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { AdminShell } from '../admin-shell';
import { adminKeys } from '../admin-keys';

export const Route = createFileRoute('/')({
  component: HomePage,
});

/* The front door of the operations console. It was a placeholder saying the
   loan book and reconciliation arrived with later phases, while its own
   navigation linked to both.

   Every panel comes from an endpoint that already existed and is already
   used by another screen. Nothing here is computed in the browser, and each
   panel carries its own query so one failing endpoint costs one panel rather
   than the whole screen. */
function HomePage(): ReactElement {
  return (
    <AdminShell current="/">
      <Page>
        <PageHeader
          title="Operations"
          description="What the loan book, the vaults and the machinery are doing right now."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TradingPanel />
          <LoanBookPanel />
          <ExposurePanel />
          <ReconciliationPanel />
          <DeadLetterPanel />
          <TrafficPanel />
        </div>
      </Page>
    </AdminShell>
  );
}

/* A panel that failed says so and stays its own size. Letting one collapse
   would reflow the other five and make a single dead endpoint look like a
   broken screen. */
function Panel({
  title,
  query,
  to,
  linkText,
  children,
}: {
  readonly title: string;
  readonly query: UseQueryResult<unknown>;
  readonly to?: string;
  readonly linkText?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card title={title}>
      <div className="flex min-h-24 flex-col justify-between gap-3">
        {query.isPending ? (
          <Skeleton lineCount={2} />
        ) : query.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            This is unavailable right now.
          </p>
        ) : (
          <div>{children}</div>
        )}
        {to === undefined || linkText === undefined ? null : (
          <Link to={to} className="font-body text-sm text-status-active">
            {linkText}
          </Link>
        )}
      </div>
    </Card>
  );
}

function Figure({
  label,
  children,
  testId,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly testId?: string;
}): ReactElement {
  return (
    <div>
      <p className="font-body text-xs text-ink-secondary">{label}</p>
      <p
        data-testid={testId}
        className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink-primary"
      >
        {children}
      </p>
    </div>
  );
}

function TradingPanel(): ReactElement {
  const query = useQuery({ queryKey: adminKeys.systemState, queryFn: fetchSystemState });
  const state = query.data;
  return (
    <Panel title="Trading" query={query} to="/operations" linkText="Pause or resume">
      {state === undefined ? null : (
        <div className="flex flex-col gap-2">
          <span className="self-start">
            <StatusBadge
              tone={state.isPaused ? 'danger' : 'success'}
              label={state.isPaused ? 'Paused' : 'Running'}
            />
          </span>
          {/* The first question anybody asks after a pause is why. */}
          {state.isPaused ? (
            <p className="font-body text-sm text-ink-secondary">
              {state.reason ?? 'No reason was recorded.'}
              {state.pausedAt === null ? null : (
                <>
                  {' '}
                  since <DateTime iso={state.pausedAt} />
                </>
              )}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function LoanBookPanel(): ReactElement {
  const query = useQuery({ queryKey: adminKeys.loanBook, queryFn: fetchLoanBook });
  const book = query.data;
  return (
    <Panel title="Loan book" query={query} to="/liquidations" linkText="Sales and defaults">
      {book === undefined ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Figure label="Outstanding" testId="outstanding-count">
            {book.outstandingCount}
          </Figure>
          <Figure label="Principal at work">
            <Money value={book.outstandingPrincipal} />
          </Figure>
          <Figure label="Overdue">{book.overdueCount}</Figure>
          <Figure label="Defaulted">{book.defaultedCount}</Figure>
        </div>
      )}
    </Panel>
  );
}

/* Exposure against the insured limit is the number that decides whether the
   vault can take another item, so it is shown as a share rather than as two
   amounts a reader has to divide. */
function ExposurePanel(): ReactElement {
  const query = useQuery({ queryKey: adminKeys.exposure, queryFn: fetchExposureByVault });
  const rows = query.data?.items ?? [];
  return (
    <Panel title="Vault exposure" query={query}>
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="font-body text-sm text-ink-secondary">No vault has taken anything in.</p>
        ) : (
          rows.map((row) => (
            <div key={row.vaultId} className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-sm text-ink-primary">{row.vaultId}</span>
              <span className="shrink-0 font-mono text-sm text-ink-secondary">
                <Percentage
                  basisPoints={shareOfLimit(row.exposure.minorUnits, row.insuredLimit.minorUnits)}
                />
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* Integer arithmetic on minor units, like every other share in this product.
   An insured limit of zero reports no exposure rather than dividing by it. */
function shareOfLimit(exposureMinorUnits: string, limitMinorUnits: string): number {
  const limit = BigInt(limitMinorUnits);
  if (limit === 0n) {
    return 0;
  }
  return Number((BigInt(exposureMinorUnits) * 10_000n) / limit);
}

function ReconciliationPanel(): ReactElement {
  const query = useQuery({
    queryKey: adminKeys.reconciliation,
    queryFn: fetchLatestReconciliation,
  });
  const run = query.data?.run ?? null;
  const driftCount = run?.drift.length ?? 0;
  const tone: StatusTone = driftCount === 0 ? 'success' : 'danger';
  return (
    <Panel title="Reconciliation" query={query} to="/reconciliation" linkText="Count a vault">
      {run === null ? (
        <p className="font-body text-sm text-ink-secondary">Nobody has counted a vault yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Drift is an incident, not a report line (docs/10-flows.md). */}
          <span className="self-start">
            <StatusBadge
              tone={tone}
              label={driftCount === 0 ? 'Clean' : `${String(driftCount)} disagreeing`}
            />
          </span>
          <p className="font-body text-sm text-ink-secondary">
            Last run <DateTime iso={run.startedAt} />
          </p>
        </div>
      )}
    </Panel>
  );
}

function DeadLetterPanel(): ReactElement {
  const query = useQuery({ queryKey: adminKeys.deadLetters, queryFn: fetchDeadLetters });
  const rows = query.data?.items ?? [];
  return (
    <Panel title="Events that gave up" query={query} to="/operations" linkText="See the queue">
      <div className="flex flex-col gap-2">
        <Figure label="Waiting for a human" testId="dead-letter-count">
          {rows.length}
        </Figure>
        {rows.length === 0 ? (
          <p className="font-body text-sm text-ink-secondary">The outbox is draining cleanly.</p>
        ) : (
          <p className="font-body text-sm text-ink-secondary">
            Oldest: {rows[0]?.type ?? ''} after {rows[0]?.attempts ?? 0} attempts.
          </p>
        )}
      </div>
    </Panel>
  );
}

function TrafficPanel(): ReactElement {
  const query = useQuery({ queryKey: adminKeys.metrics, queryFn: fetchRequestMetrics });
  const routes = query.data?.routes ?? [];
  const requests = routes.reduce((total, route) => total + route.count, 0);
  const errors = routes.reduce((total, route) => total + route.errorCount, 0);
  return (
    <Panel title="Traffic" query={query}>
      <div className="grid grid-cols-2 gap-3">
        <Figure label="Requests">{requests}</Figure>
        <Figure label="Failed">{errors}</Figure>
      </div>
    </Panel>
  );
}
