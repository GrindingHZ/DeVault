import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

interface LoanRow {
  readonly id: string;
  readonly status: string;
}

const columns = [
  { key: 'id', header: 'Loan', render: (row: LoanRow) => row.id },
  { key: 'status', header: 'Status', render: (row: LoanRow) => row.status },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Loan' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Active' })).toBeTruthy();
  });

  it('falls back to the empty state without rows', () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(row) => row.id} emptyTitle="No loans" />,
    );
    expect(screen.getByText('No loans')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('DataTable in a narrow window', () => {
  /* The defect this fixes: nothing constrained the table, so one wider than
     its container pushed the whole page sideways. */
  it('keeps a wide table inside its container', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
  });

  /* When the header row is hidden every value has to say what it is, or a
     stacked row is a column of numbers with nothing naming them. */
  it('labels every value for when the header row is gone', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    const labels = [...container.querySelectorAll('td span[aria-hidden="true"]')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['Loan', 'Status']);
  });

  it('takes an explicit label when the header is not a string', () => {
    const { container } = render(
      <DataTable
        columns={[
          {
            key: 'ltv',
            header: <span>Loan to value</span>,
            label: 'Loan to value',
            render: () => '58%',
          },
        ]}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    expect(container.querySelector('td span[aria-hidden="true"]')?.textContent).toBe(
      'Loan to value',
    );
  });

  /* display:block on a td drops the table semantics in a real browser, so
     they are written out rather than left implicit. */
  it('states its table roles rather than relying on the display type', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    expect(container.querySelector('[role="table"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="cell"]')).toHaveLength(2);
  });
});
