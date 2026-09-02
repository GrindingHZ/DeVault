import { itemCategories, nameForCategory } from '@depawn/contracts';
import { Button, CheckIcon, FilterIcon } from '@depawn/ui';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

export type BrowseScope = 'all' | 'mine';
export type BrowseSort = 'newest' | 'rate' | 'closing';
export type BrowseDensity = 'rows' | 'gallery';

export interface BrowseFiltersProps {
  readonly scope: BrowseScope;
  readonly onScope: (value: BrowseScope) => void;
  readonly category: string;
  readonly onCategory: (value: string) => void;
  readonly maxLoanToValue: string;
  readonly onMaxLoanToValue: (value: string) => void;
  readonly sort: BrowseSort;
  readonly onSort: (value: BrowseSort) => void;
  readonly density: BrowseDensity;
  readonly onDensity: (value: BrowseDensity) => void;
  readonly activeCount: number;
}

/* Four dropdowns stacked over two rows used to sit above the rail and take
   more height than the listings did. The two things a lender switches between
   constantly are here; everything they set once is behind the icon. */
export function BrowseFilters(props: BrowseFiltersProps): ReactElement {
  const [isOpen, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onAway(event: MouseEvent): void {
      if (panel.current !== null && !panel.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  return (
    <div
      data-testid="browse-controls"
      className="relative flex items-center gap-2 border-b border-edge px-2 py-1.5"
    >
      <div role="group" aria-label="Which listings" className="flex items-center gap-1">
        <ScopeButton
          isActive={props.scope === 'all'}
          onClick={() => props.onScope('all')}
          testId="scope-all"
        >
          All items
        </ScopeButton>
        <ScopeButton
          isActive={props.scope === 'mine'}
          onClick={() => props.onScope('mine')}
          testId="scope-mine"
        >
          I have offered
        </ScopeButton>
      </div>

      <button
        type="button"
        data-testid="browse-more"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setOpen((open) => !open)}
        className={`ml-auto flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs transition-colors duration-control ease-enter focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
          props.activeCount > 0
            ? 'border-accent text-accent'
            : 'border-edge-strong text-ink-secondary hover:text-ink-primary'
        }`}
      >
        <FilterIcon />
        <span className="sr-only">Sorting and filters</span>
        {/* The count is the whole point of hiding these: a reader has to be
            able to see that something is filtered without opening anything. */}
        {props.activeCount > 0 ? <span aria-hidden="true">{props.activeCount}</span> : null}
      </button>

      {isOpen ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Sorting and filters"
          className="absolute right-2 top-full z-20 mt-1 w-64 rounded-md border border-edge-strong bg-surface-raised p-2 shadow-overlay"
        >
          <Group label="Sort by">
            {(
              [
                ['newest', 'Newest first'],
                ['rate', 'Lowest rate ceiling'],
                ['closing', 'Closing soonest'],
              ] as const
            ).map(([value, label]) => (
              <Choice
                key={value}
                label={label}
                isChosen={props.sort === value}
                onClick={() => props.onSort(value)}
              />
            ))}
          </Group>

          <Group label="Category">
            <Choice
              label="Anything"
              isChosen={props.category === ''}
              onClick={() => props.onCategory('')}
            />
            {itemCategories.map((value) => (
              <Choice
                key={value}
                label={nameForCategory(value)}
                isChosen={props.category === value}
                onClick={() => props.onCategory(value)}
              />
            ))}
          </Group>

          <Group label="Loan to value at most">
            {(
              [
                ['', 'Any'],
                ['3000', '30% or less'],
                ['5000', '50% or less'],
              ] as const
            ).map(([value, label]) => (
              <Choice
                key={label}
                label={label}
                isChosen={props.maxLoanToValue === value}
                onClick={() => props.onMaxLoanToValue(value)}
              />
            ))}
          </Group>

          <Group label="Show as">
            {(
              [
                ['rows', 'Rows'],
                ['gallery', 'Gallery'],
              ] as const
            ).map(([value, label]) => (
              <Choice
                key={value}
                label={label}
                isChosen={props.density === value}
                onClick={() => props.onDensity(value)}
              />
            ))}
          </Group>

          <div className="mt-2">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScopeButton({
  isActive,
  onClick,
  children,
  testId,
}: {
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly children: string;
  readonly testId: string;
}): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={isActive}
      onClick={onClick}
      className={`rounded-sm px-2 py-1 font-body text-xs transition-colors duration-control ease-enter focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isActive
          ? 'bg-surface-raised font-semibold text-ink-primary'
          : 'text-ink-secondary hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  );
}

function Group({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className="mb-2">
      <p className="px-2 py-1 font-mono text-xs uppercase tracking-wide text-ink-secondary">
        {label}
      </p>
      {children}
    </div>
  );
}

function Choice({
  label,
  isChosen,
  onClick,
}: {
  readonly label: string;
  readonly isChosen: boolean;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left font-body text-sm transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${
        isChosen ? 'text-ink-primary' : 'text-ink-secondary'
      }`}
    >
      {label}
      {isChosen ? <span className="text-accent">{<CheckIcon />}</span> : null}
    </button>
  );
}
