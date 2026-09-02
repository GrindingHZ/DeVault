import { Button, Legend, StatusBadge, TermBar } from '@depawn/ui';
import type { DataTableColumn } from '@depawn/ui';
import type { ReactElement } from 'react';
import type { Position, PositionSide } from './position';
import { stagesFor } from './stages';

/* The columns each table carries.

   Borrowing and lending are not one table with a filter. A borrower reads a
   loan as a cost and a lender reads the same loan as a return, so the money
   columns are named differently and mean different things. Writing them out
   twice is the honest form; parameterising them would only hide that. */

/* The item leads every table, and it is the way back to the thing itself.
   A row with nowhere to go renders no control rather than a button that does
   nothing when pressed. */
function ItemCell({
  position,
  onOpen,
}: {
  readonly position: Position;
  readonly onOpen: (() => void) | undefined;
}): ReactElement {
  /* A floor is set on the width because a table cell sizes to its content,
     and with eight columns competing the item was squeezed to four lines
     while the number columns sat half empty. A ceiling too, because a real
     appraisal names the maker, the model, the size and the certificate, and
     one long description should not push the figures off the screen. */
  const reading = (
    <>
      <span className="font-body text-sm font-semibold leading-snug text-ink-primary">
        {position.itemDescription}
      </span>
      <span className="font-body text-xs text-ink-secondary">{position.caption}</span>
    </>
  );
  if (onOpen === undefined) {
    return <span className="flex min-w-40 max-w-60 flex-col gap-0.5 py-1">{reading}</span>;
  }
  return (
    <button
      type="button"
      data-testid="position-item"
      onClick={onOpen}
      className="flex min-w-40 max-w-60 flex-col gap-0.5 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
    >
      {reading}
    </button>
  );
}

/* Never wraps. "AUD 2,500.00" broke onto two lines in a column this narrow,
   which is why the currency moved to the header and the figure stayed
   whole. */
function Amount({ value, strong }: { readonly value: string; readonly strong?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap font-figure text-sm tabular-nums text-ink-primary ${
        strong === true ? 'font-semibold' : ''
      }`}
    >
      {value}
    </span>
  );
}

/* The currency, once. Every figure in the column below is bare. */
function head(label: string, currency: string): ReactElement {
  return <span className="whitespace-nowrap">{`${label} (${currency})`}</span>;
}

/* Both interest figures in one cell: what has built up, over what the whole
   term comes to.

   They started as two columns. Eight columns in the width available pushed
   the status and the action off the side of the table, and those are the two
   things a reader came for. Paired like this they also read better: a number
   over its total is a progress reading, which is what interest accruing
   actually is. */
function InterestCell({ position }: { readonly position: Position }): ReactElement {
  if (position.metrics === null) {
    return <Amount value={nothingToShow} />;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Amount value={position.metrics.interestSoFar} />
      <span className="whitespace-nowrap font-body text-xs text-ink-secondary">
        {`of ${position.metrics.interestWholeTerm}`}
      </span>
    </span>
  );
}

/* A closed loan has no live interest figure to show. The server recomputes
   accrual against its own clock on every read, so a repaid loan would report
   a whole term's interest rather than what was paid (Q-029). A dash says
   nothing, which is the truth, rather than a number that is wrong. */
const nothingToShow = '-';

function statusHeader(side: PositionSide, label: string): ReactElement {
  return (
    <span className="inline-flex items-center">
      {label}
      <Legend noun="status" testId={`status-legend-${side}`} entries={stagesFor(side)} />
    </span>
  );
}

function statusColumn(side: PositionSide): DataTableColumn<Position> {
  return {
    key: 'status',
    label: 'Status',
    header: statusHeader(side, 'Status'),
    render: (position) => <StatusBadge tone={position.tone} label={position.stage} />,
  };
}

function actionColumn(onAct: (position: Position) => void): DataTableColumn<Position> {
  return {
    key: 'action',
    label: 'Action',
    header: '',
    render: (position) =>
      position.action === null ? null : (
        /* Never wraps. "Claim the collateral" broke over three lines in a
           column sized to its shortest neighbour, which made one row twice
           the height of the rest. */
        <Button variant="secondary" className="whitespace-nowrap" onClick={() => onAct(position)}>
          {position.action.label}
        </Button>
      ),
  };
}

function termColumn(): DataTableColumn<Position> {
  return {
    key: 'term',
    label: 'Term',
    header: 'Term',
    render: (position) =>
      position.metrics === null ? (
        <span className="font-body text-xs text-ink-secondary">closed</span>
      ) : (
        <TermBar
          elapsedBasisPoints={position.metrics.term.elapsedBasisPoints}
          note={position.metrics.term.note}
          tone={position.metrics.term.tone}
        />
      ),
  };
}

export interface RowHandlers {
  readonly onAct: (position: Position) => void;
  readonly openerFor: (position: Position) => (() => void) | undefined;
  /* Stated in the headers so it is not repeated down every column. */
  readonly currency: string;
}

export function borrowedLoanColumns({
  onAct,
  openerFor,
  currency,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Item',
      header: 'Item',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'principal',
      label: 'Borrowed',
      header: head('Borrowed', currency),
      render: (p) => <Amount value={p.metrics?.principal ?? nothingToShow} />,
    },
    {
      key: 'interest',
      label: 'Interest',
      header: head('Interest', currency),
      render: (p) => <InterestCell position={p} />,
    },
    {
      key: 'settlement',
      label: 'Owed today',
      header: head('Owed today', currency),
      render: (p) => <Amount value={p.metrics?.settlementAmount ?? nothingToShow} strong />,
    },
    termColumn(),
    statusColumn('borrowing'),
    actionColumn(onAct),
  ];
}

export function lentLoanColumns({
  onAct,
  openerFor,
  currency,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Collateral',
      header: 'Collateral',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'principal',
      label: 'Lent',
      header: head('Lent', currency),
      render: (p) => <Amount value={p.metrics?.principal ?? nothingToShow} />,
    },
    {
      key: 'interest',
      label: 'Earned',
      header: head('Earned', currency),
      render: (p) => <InterestCell position={p} />,
    },
    {
      key: 'settlement',
      label: 'At maturity',
      header: head('At maturity', currency),
      render: (p) => <Amount value={p.metrics?.settlementAmount ?? nothingToShow} strong />,
    },
    termColumn(),
    statusColumn('lending'),
    actionColumn(onAct),
  ];
}

/* Listings and offers have no term and no accrual, so they get a narrower
   table of their own rather than five empty columns in the loan table.

   Two tables rather than one shared shape: a listing is waiting for a rate
   and an offer is holding money at one, so the columns are different facts.
   A single shared column briefly labelled a rate "Held (AUD)". */
export function listingColumns({
  onAct,
  openerFor,
  currency,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Item',
      header: 'Item',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'asking',
      label: 'Asking',
      header: head('Asking', currency),
      render: (p) => <Amount value={p.pending?.principal ?? nothingToShow} />,
    },
    {
      key: 'best-offer',
      label: 'Best offer',
      header: <span className="whitespace-nowrap">Best offer</span>,
      /* Null means nobody has offered, which is not a rate of nothing. */
      render: (p) =>
        p.pending?.rate === null || p.pending === null ? (
          <span className="whitespace-nowrap font-body text-sm text-ink-secondary">none yet</span>
        ) : (
          <Amount value={p.pending.rate} strong />
        ),
    },
    statusColumn('borrowing'),
    actionColumn(onAct),
  ];
}

export function offerColumns({
  onAct,
  openerFor,
  currency,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Collateral',
      header: 'Collateral',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'rate',
      label: 'Your rate',
      header: <span className="whitespace-nowrap">Your rate</span>,
      render: (p) => <Amount value={p.pending?.rate ?? nothingToShow} strong />,
    },
    {
      key: 'held',
      label: 'Held',
      header: head('Held', currency),
      render: (p) => <Amount value={p.pending?.principal ?? nothingToShow} />,
    },
    statusColumn('lending'),
    actionColumn(onAct),
  ];
}
