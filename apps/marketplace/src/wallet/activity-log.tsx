import { fetchChainActivity } from '@depawn/contracts';
import type { ChainActivityEntry } from '@depawn/contracts';
import { ChainLink, EmptyState, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';

function timeOf(atMs: number | null): string {
  if (atMs === null) {
    return '';
  }
  return new Date(atMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* The member's own on-chain history, newest first, read straight from the
   chain. Every row is one transaction, named for what it did; opening it shows
   the transaction hash and every object and account it touched, each a link to
   the Sui explorer, so the reader can see the proof rather than take the app's
   word for it. */
export function ActivityLog(): ReactElement {
  const activity = useQuery({ queryKey: ['chain', 'activity'], queryFn: fetchChainActivity });

  if (activity.isPending) {
    return <Skeleton lineCount={4} />;
  }
  if (activity.isError || activity.data === undefined) {
    return (
      <p role="alert" className="font-body text-sm text-status-danger">
        Your on-chain activity could not be read from the chain.
      </p>
    );
  }
  const items = activity.data.items;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No on-chain activity yet"
        description="Your listings, offers, loans and redemptions will appear here, each with the hashes that prove it on Sui."
      />
    );
  }
  return (
    <ul
      data-testid="activity-log"
      className="flex flex-col divide-y divide-edge border-y border-edge"
    >
      {items.map((entry) => (
        <ActivityRow key={entry.transactionDigest} entry={entry} />
      ))}
    </ul>
  );
}

function ActivityRow({ entry }: { readonly entry: ChainActivityEntry }): ReactElement {
  const [isOpen, setOpen] = useState(false);
  const when = timeOf(entry.atMs);
  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        data-testid={`activity-${entry.transactionDigest}`}
        onClick={() => setOpen((open) => !open)}
        className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
      >
        <Chevron isOpen={isOpen} />
        <span className="min-w-0 flex-1 truncate font-body text-sm font-medium text-ink-primary">
          {entry.label}
        </span>
        {when === '' ? null : (
          <span className="shrink-0 font-body text-xs tabular-nums text-ink-secondary">{when}</span>
        )}
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-2 px-1 pb-3 pl-8">
          <p className="font-body text-xs text-ink-secondary">{entry.description}</p>
          <dl className="flex flex-col gap-1.5">
            {entry.references.map((reference) => (
              <div
                key={`${reference.kind}-${reference.value}`}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="shrink-0 font-body text-xs text-ink-secondary">{reference.label}</dt>
                <dd className="min-w-0 truncate text-right">
                  <ChainLink value={reference.value} kind={reference.kind} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function Chevron({ isOpen }: { readonly isOpen: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform duration-control ease-enter ${
        isOpen ? 'rotate-90' : ''
      }`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
