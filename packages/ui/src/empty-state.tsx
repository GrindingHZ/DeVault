import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: string;
  /* Spelled with `undefined` because the package compiles under
     `exactOptionalPropertyTypes`, where an absent prop and a prop holding
     undefined are different types. Callers forwarding an optional of their
     own, as DataTable does with `emptyDescription`, pass the second. */
  readonly description?: string | undefined;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-edge p-8 text-center">
      <p className="font-heading text-base font-semibold text-ink-primary">{title}</p>
      {description === undefined ? null : (
        <p className="font-body text-sm text-ink-secondary">{description}</p>
      )}
      {action}
    </div>
  );
}
