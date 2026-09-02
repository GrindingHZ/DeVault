import type { ReactElement, ReactNode } from 'react';

export interface SummaryFigure {
  readonly label: string;
  readonly value: ReactNode;
  /* Attention is a count of things waiting, and a zero there is good news
     rather than a number to shout about. */
  readonly tone?: 'plain' | 'attention';
  readonly testId?: string;
}

export interface SummaryStripProps {
  readonly figures: readonly SummaryFigure[];
}

/* The figures across the top of a portfolio. Both sides at once, because one
   person is both a borrower and a lender and the tab below filters the table
   rather than the totals. */
export function SummaryStrip({ figures }: SummaryStripProps): ReactElement {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-edge pb-4">
      {figures.map((figure) => (
        <div key={figure.label} className="flex flex-col gap-0.5">
          <dt className="font-body text-xs text-ink-secondary">{figure.label}</dt>
          <dd
            data-testid={figure.testId}
            data-tone={figure.tone === 'attention' ? 'attention' : undefined}
            className={`font-figure text-lg font-semibold tabular-nums ${
              figure.tone === 'attention' ? 'text-status-warning' : 'text-ink-primary'
            }`}
          >
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
