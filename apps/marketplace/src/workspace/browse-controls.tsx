import { itemCategories, nameForCategory } from '@depawn/contracts';
import {
  ArtIcon,
  BullionIcon,
  Button,
  CheckIcon,
  Chip,
  CollectibleIcon,
  FilterIcon,
  GalleryIcon,
  JewelleryIcon,
  RowsIcon,
  Tab,
  TabItem,
  TabStrip,
  WatchIcon,
  focusRing,
  tabLinkClasses,
} from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/* Which listings the rail is showing.

   "All items" mixed the reader's own listings in with everybody else's, which
   made the one tab a lender lives in noisier and gave a borrower nowhere to
   look. Three answers to one question instead: other people's, the ones you
   have money against, and your own. */
export type BrowseScope = 'browse' | 'offered' | 'listings';
export type BrowseSort = 'newest' | 'ltv' | 'closing';
export type BrowseDensity = 'rows' | 'gallery';

export interface BrowseControlsProps {
  readonly scope: BrowseScope;
  readonly onScope: (value: BrowseScope) => void;
  readonly category: string;
  readonly onCategory: (value: string) => void;
  readonly sort: BrowseSort;
  readonly onSort: (value: BrowseSort) => void;
  readonly density: BrowseDensity;
  readonly onDensity: (value: BrowseDensity) => void;
  readonly activeCount: number;
}

/* A picture beside each name. The categories are the one filter a reader
   scans rather than reads, and five words in a column all look alike. */
const categoryIcons: Record<string, ReactNode> = {
  BULLION: <BullionIcon />,
  WATCH: <WatchIcon />,
  JEWELLERY: <JewelleryIcon />,
  COLLECTIBLE: <CollectibleIcon />,
  ART: <ArtIcon />,
};

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
          {/* A destination among the view toggles, so it is a link rather
              than a Tab: the secondary market is the other face of Browse
              (docs/superpowers/specs/2026-08-24-secondary-market-design.md). */}
          <Link to="/listings/positions" data-testid="scope-positions" className={tabLinkClasses}>
            <TabItem label="Positions for sale" isActive={false} />
          </Link>
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
            {/* "Lowest rate ceiling" sorted on the most a borrower is willing
                to pay, which is not a rate anybody on this screen is being
                offered: the order had nothing to do with the figures in the
                rail. What a lender compares is how much of the appraisal is
                being borrowed against, which is the figure on every row. */}
            {(
              [
                ['newest', 'Newest first'],
                ['ltv', 'Lowest loan to value'],
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
                icon={categoryIcons[value]}
                isChosen={props.category === value}
                onClick={() => props.onCategory(value)}
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
  icon,
  isChosen,
  onClick,
}: {
  readonly label: string;
  readonly icon?: ReactNode;
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
      <span className="flex min-w-0 items-center gap-2">
        {icon === undefined ? null : (
          <span aria-hidden="true" className="shrink-0 text-ink-secondary">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </span>
      {isChosen ? <span className="shrink-0 text-accent">{<CheckIcon />}</span> : null}
    </button>
  );
}
