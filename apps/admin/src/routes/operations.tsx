import {
  fetchAuditPage,
  fetchSystemState,
  nameForAuditAction,
  pauseSystem,
  unpauseSystem,
} from '@depawn/contracts';
import type { AuditEntryResponse } from '@depawn/contracts';
import {
  Button,
  Card,
  DataTable,
  DateTime,
  Field,
  Page,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { AdminShell } from '../admin-shell';

export const Route = createFileRoute('/operations')({
  component: OperationsPage,
});

const operationsKeys = {
  systemState: ['system-state'] as const,
  audit: (subjectId: string) => ['audit', subjectId] as const,
};

function OperationsPage(): ReactElement | null {
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
  if (!currentAccount.data.roles.includes('OPERATIONS')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          Operations tools require the operations role.
        </p>
      </main>
    );
  }

  return (
    <AdminShell current="/operations">
      <Page>
        <PageHeader title="Operations" description="The pause switch and the audit trail." />
        <PauseCard />
        <AuditCard />
      </Page>
    </AdminShell>
  );
}

function PauseCard(): ReactElement {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pauseKey, setPauseKey] = useState(() => crypto.randomUUID());
  const [resumeKey, setResumeKey] = useState(() => crypto.randomUUID());
  const stateQuery = useQuery({
    queryKey: operationsKeys.systemState,
    queryFn: fetchSystemState,
  });

  const pauseMutation = useMutation({
    mutationFn: (why: string) => pauseSystem({ reason: why }, { idempotencyKey: pauseKey }),
    onSuccess: async () => {
      setPauseKey(crypto.randomUUID());
      setReason('');
      await queryClient.invalidateQueries({ queryKey: operationsKeys.systemState });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => unpauseSystem({ idempotencyKey: resumeKey }),
    onSuccess: async () => {
      setResumeKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: operationsKeys.systemState });
    },
  });

  if (stateQuery.isPending) {
    return (
      <Card title="Trading">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (stateQuery.isError || stateQuery.data === undefined) {
    return (
      <Card title="Trading">
        <p role="alert" className="font-body text-sm text-status-danger">
          The system state could not be loaded.
        </p>
      </Card>
    );
  }

  const state = stateQuery.data;
  return (
    <Card title="Trading">
      <div data-testid="system-state" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge
            tone={state.isPaused ? 'danger' : 'success'}
            label={state.isPaused ? 'PAUSED' : 'RUNNING'}
          />
          {state.reason === null ? null : (
            <span className="font-body text-sm text-ink-secondary">{state.reason}</span>
          )}
        </div>
        <p className="font-body text-sm text-ink-secondary">
          Pausing stops new listings, offers, acceptances, and sales opening or taking bids. It
          never stops a repayment, a redemption, a withdrawal, a reclaim, a default, a claim, or the
          settling of a sale already taking bids.
        </p>
        {state.isPaused ? (
          <div>
            <Button
              data-testid="resume-trading"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              Resume trading
            </Button>
          </div>
        ) : (
          <form
            className="flex items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim() === '') {
                setReasonError('Say why trading is stopping.');
                return;
              }
              setReasonError(null);
              pauseMutation.mutate(reason.trim());
            }}
          >
            <Field
              label="Reason"
              data-testid="pause-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              errorMessage={reasonError ?? undefined}
            />
            <Button data-testid="pause-trading" type="submit" disabled={pauseMutation.isPending}>
              Pause trading
            </Button>
          </form>
        )}
        {pauseMutation.isError || resumeMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The switch could not be thrown.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function AuditCard(): ReactElement {
  const [subjectId, setSubjectId] = useState('');
  const [searched, setSearched] = useState('');
  const auditQuery = useQuery({
    queryKey: operationsKeys.audit(searched),
    queryFn: () => fetchAuditPage(searched === '' ? {} : { subject: searched }),
  });

  return (
    <Card title="Audit trail">
      <form
        className="mb-4 flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearched(subjectId.trim());
        }}
      >
        <Field
          label="Subject id"
          data-testid="audit-subject"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
        />
        <Button data-testid="audit-search" type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {auditQuery.isPending ? (
        <Skeleton lineCount={4} />
      ) : auditQuery.isError || auditQuery.data === undefined ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          The audit trail could not be loaded.
        </p>
      ) : (
        <div data-testid="audit-table">
          <DataTable
            columns={[
              {
                key: 'when',
                header: 'When',
                render: (entry: AuditEntryResponse) => (
                  <DateTime iso={entry.recordedAt} precision="second" />
                ),
              },
              /* The whole purpose of this screen is answering who did what.
                 It used to answer with two opaque strings: an account id and
                 a snake case identifier. The id stays in the title, because
                 an investigation sometimes needs the exact value. */
              {
                key: 'actor',
                header: 'Who',
                render: (entry: AuditEntryResponse) => (
                  <span title={entry.actorId} className="font-body text-sm">
                    {entry.actorLabel ?? entry.actorId}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Did what',
                render: (entry: AuditEntryResponse) => nameForAuditAction(entry.action),
              },
              {
                key: 'subject',
                header: 'To what',
                render: (entry: AuditEntryResponse) => (
                  <span title={entry.subjectId} className="font-body text-sm">
                    {entry.subjectType} {entry.subjectId.slice(-6).toUpperCase()}
                  </span>
                ),
              },
            ]}
            rows={auditQuery.data.items}
            rowKey={(entry) => entry.id}
            emptyTitle="Nothing recorded yet"
          />
        </div>
      )}
    </Card>
  );
}
