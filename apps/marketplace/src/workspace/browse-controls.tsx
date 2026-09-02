import { itemCategories, nameForCategory } from '@depawn/contracts';
import {
  Button,
  CheckIcon,
  Chip,
  FilterIcon,
  GalleryIcon,
  RowsIcon,
  Tab,
  TabStrip,
  focusRing,
} from '@depawn/ui';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/* Which listings the rail is showing.

   "All items" mixed the reader's own listings in with everybody else's, which
   made the one tab a lender lives in noisier and gave a borrower nowhere to
   look. Three answers to one question instead: other people's, the ones you
   have money against, and your own. */
export type BrowseScope = 'browse' | 'offered' | 'listings';
export type BrowseSort = 'newest' | 'rate' | 'closing';
export type BrowseDensity = 'rows' | 'gallery';

export interface BrowseControlsProps {
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

const scopeTabs: readonly { readonly value: BrowseScope; readonly label: string }[] = [
  { value: 'browse', label: 'Browse items' },
  { value: 'offered', label: 'My offers' },
  { value: 'listings', label: 'My listings' },
];

/* Four dropdowns stacked over two rows used to sit above the rail and take
   more height than the listings did. The two things a lender switches between
   constantly are here; everything they set once is behind the icon. */
export function BrowseControls(props: BrowseControlsProps): ReactElement {
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
      /* The tabs carry the row height themselves now, so the bar no longer
         pads its own. Without dropping this the workspace toolbar grew by a
         third against a screen tuned to fit a book, a rail and a tape. */
      className="relative flex items-center gap-2 border-b border-edge px-2 py-0.5"
    >
      {/* The tabs give way, the controls do not. The rail can be dragged
          narrow enough that three tabs plus two toggles plus the filter will
          not fit, and when that happens it is the tabs that scroll: a reader
          can always reach the one they want by looking, but a filter clipped
          off the right hand edge is simply gone. The scrollbar is hidden
          because a second one under a toolbar reads as a broken layout. */}
      <div className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabStrip label="Which listings">
          {scopeTabs.map((tab) => (
            <Tab
              key={tab.value}
              label={tab.label}
              isActive={props.scope === tab.value}
              testId={`scope-${tab.value}`}
              onSelect={() => props.onScope(tab.value)}
            />
          ))}
        </TabStrip>
      </div>

      {/* How the rail is laid out is one press, not a menu item three
          clicks deep. It changes what the reader is looking at rather than
          what is in the list, which is why it sits on the bar beside the
          filter instead of inside it. */}
      <span className="flex shrink-0 items-center gap-1">
        <DensityToggle
          icon={<RowsIcon />}
          label="Show as rows"
          testId="density-rows"
          isActive={props.density === 'rows'}
          onSelect={() => props.onDensity('rows')}
        />
        <DensityToggle
          icon={<GalleryIcon />}
          label="Show as a gallery"
          testId="density-gallery"
          isActive={props.density === 'gallery'}
          onSelect={() => props.onDensity('gallery')}
        />
      </span>

      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-edge" />

      {/* The count is the whole point of hiding these: a reader has to be
          able to see that something is filtered without opening anything. */}
      <Chip
        className="shrink-0"
        testId="browse-more"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setOpen((open) => !open)}
        icon={<FilterIcon />}
        label="Sorting and filters"
        isLabelHidden
        isActive={props.activeCount > 0}
        count={props.activeCount}
      />

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

          <div className="mt-2">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* One of a pair. Icon only, so it takes a real label for anybody who cannot
   see which of the two is lit. */
function DensityToggle({
  icon,
  label,
  testId,
  isActive,
  onSelect,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly testId: string;
  readonly isActive: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onSelect}
      className={[
        'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm',
        'transition-colors duration-control ease-enter',
        focusRing,
        isActive
          ? 'bg-surface-sunken text-ink-primary'
          : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

function Group({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="mb-2">
      <p className="px-2 py-1 font-body text-xs font-medium uppercase tracking-wide text-ink-secondary">
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
      /* A row in a menu, not a control on the bar. It takes the shared ring
         and stops there: a full width row that lifts under the cursor reads
         as the panel coming apart. */
      className={[
        'flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1',
        'text-left font-body text-sm transition-colors duration-control ease-enter',
        'hover:bg-surface-sunken',
        focusRing,
        isChosen ? 'text-ink-primary' : 'text-ink-secondary',
      ].join(' ')}
    >
      {label}
      {isChosen ? <span className="text-accent">{<CheckIcon />}</span> : null}
    </button>
  );
}
