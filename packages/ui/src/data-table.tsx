import type { ReactElement, ReactNode } from 'react';
import { EmptyState } from './empty-state';

export interface DataTableColumn<Row> {
  readonly key: string;
  /* A node rather than a string, so a column can carry an explain next to
     its name without every table inventing its own header markup. */
  readonly header: ReactNode;
  /* What to call this column when the table stacks and the header row is
     gone. Only needed when the header is a node rather than a string; a
     string header is used as its own label. */
  readonly label?: string;
  readonly render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly emptyTitle: string;
  /* What to do about it. An empty table that only says it is empty leaves
     the reader to work out whether that is a problem and what would fix
     it. */
  readonly emptyDescription?: string;
}

function labelOf<Row>(column: DataTableColumn<Row>): string {
  if (column.label !== undefined) {
    return column.label;
  }
  return typeof column.header === 'string' ? column.header : column.key;
}

/* Wide on a wide window, stacked on a narrow one.

   Two things this fixes. A table wider than its container used to push the
   whole page sideways, because nothing constrained it. And a table that only
   scrolls horizontally on a phone is technically intact and practically
   unreadable, so below the medium breakpoint each row becomes a block and
   every value carries the column name it lost when the header row went away.

   The roles are written out rather than left implicit: a `display: block` on
   a `td` drops the table semantics in a real browser, which would quietly
   cost a screen reader the entire structure. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyTitle,
  emptyDescription,
}: DataTableProps<Row>): ReactElement {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table role="table" className="w-full border-collapse font-body text-sm">
        <thead role="rowgroup" className="hidden md:table-header-group">
          <tr role="row" className="border-b border-edge text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                role="columnheader"
                scope="col"
                className="h-row px-3 font-medium text-ink-secondary"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block md:table-row-group">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              role="row"
              className="mb-3 block rounded-md border border-edge text-ink-primary md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  role="cell"
                  /* Vertical room on the wide layout too. `h-row` sets a
                     floor rather than a height, and with three line cells
                     like a term meter the content ran hard into the row
                     above and below it. */
                  className="flex items-baseline justify-between gap-4 px-3 py-1 md:h-row md:table-cell md:py-2"
                >
                  <span
                    aria-hidden="true"
                    className="font-body text-xs text-ink-secondary md:hidden"
                  >
                    {labelOf(column)}
                  </span>
                  <span className="min-w-0 text-right md:text-left">{column.render(row)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
