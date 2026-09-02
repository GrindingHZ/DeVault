import type { ReactElement } from 'react';
import { Popover } from './popover';
import { StatusBadge } from './status-badge';
import type { StatusTone } from './status-badge';

export interface LegendEntry {
  readonly label: string;
  readonly tone: StatusTone;
  readonly meaning: string;
}

export interface LegendProps {
  /* The noun the column holds, singular and lower case in the middle of a
     sentence: "status" becomes "What each status means". Passing a whole
     phrase here produced "What every what each status means means". */
  readonly noun: string;
  readonly entries: readonly LegendEntry[];
  readonly testId: string;
}

/* Every value a status column can take, and what each one means.

   The entries come from wherever the statuses are defined, never from a copy
   written here. A legend that has fallen behind the code is worse than no
   legend, because it tells the reader they have seen all of them. */
export function Legend({ noun, entries, testId }: LegendProps): ReactElement {
  const heading = `What each ${noun} means`;
  return (
    <Popover
      label={heading}
      testId={testId}
      trigger="i"
      triggerClassName={[
        'ml-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center',
        'rounded-full border border-edge font-body text-[10px] font-semibold italic leading-none',
        'text-ink-secondary transition-colors duration-control ease-enter',
        'hover:border-accent hover:text-accent',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
      ].join(' ')}
    >
      <div className="p-4">
        <p className="mb-3 font-body text-sm font-semibold text-ink-primary">{heading}</p>
        <dl className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-1">
              <dt>
                <StatusBadge tone={entry.tone} label={entry.label} />
              </dt>
              <dd className="font-body text-sm leading-relaxed text-ink-secondary">
                {entry.meaning}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Popover>
  );
}
