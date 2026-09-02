import { Button, ItemPhotograph, Legend, StatusBadge, TermBar } from '@depawn/ui';
import type { DataTableColumn } from '@depawn/ui';
import type { ReactElement } from 'react';
import type { Position, PositionSide } from './position';
import { stagesFor } from './stages';

/* The columns each side carries.

   One table per side, not one per entity. There were two, split by what the
   row came from: loans in one, listings and offers in the other. That is the
   same mistake the portfolio was built to end, only smaller, and it left a
   reader asking why their own things were in two places. A listing and the
   loan it becomes are one story, and the columns below are the questions
   that story answers at every stage: how much, what has it cost or earned,
   what does it settle at, how long is left.

   Borrowing and lending stay apart, because a borrower reads a loan as a
   cost and a lender reads the same loan as a return. Writing them out twice
   is the honest form; parameterising them would only hide it. */

function ItemCell({
  position,
  onOpen,
}: {
  readonly position: Position;
  readonly onOpen: (() => void) | undefined;
}): ReactElement {
  /* A floor and a ceiling on the width. A table cell sizes to its content,
     and with seven columns competing the item was squeezed to four lines
     while the number columns sat half empty; a real appraisal also names the
     maker, the model, the size and the certificate, and one long description
     should not push the figures off the screen. */
  const reading = (
    <>
      <ItemPhotograph src={position.photographSrc} alt={position.itemDescription} size="compact" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-body text-sm font-semibold leading-snug text-ink-primary">
          {position.itemDescription}
        </span>
        <span className="font-body text-xs text-ink-secondary">{position.caption}</span>
      </span>
    </>
  );
  const box = 'flex min-w-44 max-w-64 items-center gap-2.5 py-1.5 text-left';
  if (onOpen === undefined) {
    return <span className={box}>{reading}</span>;
  }
  return (
    <button
      type="button"
      data-testid="position-item"
      onClick={onOpen}
      className={`${box} focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active`}
    >
      {reading}
    </button>
  );
}

function Amount({
  value,
  strong,
}: {
  readonly value: string;
  readonly strong?: boolean;
}): ReactElement {
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

/* A closed row has no live figure to show. The server recomputes accrual
   against its own clock on every read, so a repaid loan would report a whole
   term's interest rather than what was paid (Q-029). A dash says nothing,
   which is the truth, rather than a number that is wrong. */
const nothingToShow = '-';

/* Headers carry no currency. It is stated once above the table instead: a
   "(AUD)" on each of three money columns cost about a hundred pixels of
   width and pushed the action button off the side, which is a poor trade for
   repeating something that never changes down the page. */
function head(label: string): ReactElement {
  return <span className="whitespace-nowrap">{label}</span>;
}

/* Both interest figures in one cell: what has built up, over what the whole
   term comes to. A number over its total is a progress reading, which is
   what interest accruing actually is. */
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

function statusColumn(side: PositionSide): DataTableColumn<Position> {
  return {
    key: 'status',
    label: 'Status',
    header: (
      <span className="inline-flex items-center">
        Status
        <Legend noun="status" testId={`status-legend-${side}`} entries={stagesFor(side)} />
      </span>
    ),
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

/* How long is left, whatever the row is. A loan runs to maturity and gets a
   bar; a listing and an offer run to an expiry with no recorded start, so
   they get the words alone rather than a bar drawn from a guess. A closed
   row gets a dash, like every other column with nothing true to say. */
function termColumn(): DataTableColumn<Position> {
  return {
    key: 'term',
    label: 'Term',
    header: <span className="whitespace-nowrap">Term</span>,
    render: (position) => {
      if (position.term === null) {
        return <Amount value={nothingToShow} />;
      }
      if (position.term.elapsedBasisPoints === null) {
        return (
          /* Wraps. "closes in 14 days" on one line was as wide as the bar
             it stands in for, and the column is not worth that. */
          <span className="block w-24 font-body text-xs text-ink-secondary">
            {position.term.note}
          </span>
        );
      }
      return (
        <TermBar
          elapsedBasisPoints={position.term.elapsedBasisPoints}
          note={position.term.note}
          tone={position.term.tone}
        />
      );
    },
  };
}

export interface RowHandlers {
  readonly onAct: (position: Position) => void;
  readonly openerFor: (position: Position) => (() => void) | undefined;
}

export function openBorrowingColumns({
  onAct,
  openerFor,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Item',
      header: 'Item',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      header: head('Amount'),
      render: (p) => <Amount value={p.amount ?? nothingToShow} />,
    },
    {
      key: 'interest',
      label: 'Interest',
      header: head('Interest'),
      render: (p) => <InterestCell position={p} />,
    },
    {
      key: 'settlement',
      label: 'Owed today',
      header: head('Owed today'),
      render: (p) => <Amount value={p.metrics?.settlementAmount ?? nothingToShow} strong />,
    },
    termColumn(),
    statusColumn('borrowing'),
    actionColumn(onAct),
  ];
}

export function openLendingColumns({
  onAct,
  openerFor,
}: RowHandlers): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: 'Collateral',
      header: 'Collateral',
      render: (p) => <ItemCell position={p} onOpen={openerFor(p)} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      header: head('Amount'),
      render: (p) => <Amount value={p.amount ?? nothingToShow} />,
    },
    {
      key: 'interest',
      label: 'Earned',
      header: head('Earned'),
      render: (p) => <InterestCell position={p} />,
    },
    {
      key: 'settlement',
      label: 'At maturity',
      header: head('At maturity'),
      render: (p) => <Amount value={p.metrics?.settlementAmount ?? nothingToShow} strong />,
    },
    termColumn(),
    statusColumn('lending'),
    actionColumn(onAct),
  ];
}

/* History carries less, because less is true about it.

   Running the open columns over closed rows put a dash under Interest, under
   the settlement and under Term on every line: four columns of nothing,
   which is what made two tables look arbitrary in the first place. What is
   still known about a finished position is what it was worth and how it
   ended. */
export function historyColumns(side: PositionSide): readonly DataTableColumn<Position>[] {
  return [
    {
      key: 'item',
      label: side === 'borrowing' ? 'Item' : 'Collateral',
      header: side === 'borrowing' ? 'Item' : 'Collateral',
      render: (p) => <ItemCell position={p} onOpen={undefined} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      header: head('Amount'),
      render: (p) => <Amount value={p.amount ?? nothingToShow} />,
    },
    statusColumn(side),
  ];
}
