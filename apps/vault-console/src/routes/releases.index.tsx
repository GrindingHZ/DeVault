import { fetchReleaseQueue } from '@depawn/contracts';
import type { ReleaseQueueResponse } from '@depawn/contracts';
import { Card, DataTable, Page, PageHeader, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { StaffGuard } from '../staff-guard';

type ReleaseRow = ReleaseQueueResponse['items'][number];

export const Route = createFileRoute('/releases/')({
  component: ReleasesPage,
});

function ReleasesPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <Page>
          <PageHeader
            title="Releases"
            description="Members who burned their receipt on chain and are waiting to collect. Check identity at the counter before you hand the item over."
          />
          <ReleaseQueueCard />
        </Page>
      </ConsoleShell>
    </StaffGuard>
  );
}

function ReleaseQueueCard(): ReactElement {
  const queueQuery = useQuery({
    queryKey: ['chain', 'releases'],
    queryFn: () => fetchReleaseQueue(),
  });

  if (queueQuery.isPending) {
    return (
      <Card title="Releases">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (queueQuery.isError || queueQuery.data === undefined) {
    return (
      <Card title="Releases">
        <p role="alert" className="font-body text-sm text-status-danger">
          The release queue could not be read from the chain.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Releases">
      <div data-testid="release-queue">
        <DataTable
          columns={[
            {
              key: 'receipt',
              header: 'Receipt',
              render: (item: ReleaseRow) => (
                <span className="font-mono text-xs">{item.receiptKey}</span>
              ),
            },
            {
              key: 'collector',
              header: 'Collector',
              render: (item: ReleaseRow) => (
                <a
                  href={`https://suiscan.xyz/testnet/account/${item.holder}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-status-active underline"
                >
                  {item.holder.slice(0, 10)}...{item.holder.slice(-6)}
                </a>
              ),
            },
            {
              key: 'burn',
              header: 'Burn',
              render: (item: ReleaseRow) => (
                <a
                  href={`https://suiscan.xyz/testnet/tx/${item.digest}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-ink-secondary underline"
                >
                  {item.digest.slice(0, 10)}...
                </a>
              ),
            },
          ]}
          rows={queueQuery.data.items}
          rowKey={(item) => item.digest}
          emptyTitle="Nobody is waiting at the counter"
        />
      </div>
    </Card>
  );
}
