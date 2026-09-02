import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSaleSummary } from '@depawn/contracts';
import { PositionSaleRow } from './position-sale-row';

function money(minorUnits: string): { minorUnits: string; currency: string } {
  return { minorUnits, currency: 'USD' };
}

const sale: NoteSaleSummary = {
  id: 'SALE1',
  loanId: 'LOAN1',
  lenderNoteId: 'LN1',
  sellerAccountId: 'SELLER',
  status: 'OPEN',
  askPrice: money('245000'),
  createdAt: '2026-08-01T00:00:00.000Z',
  itemDescription: 'One kilogram gold bar, cast',
  itemCategory: 'BULLION',
  principal: money('250000'),
  annualPercentageRateBasisPoints: 1800,
  startedAt: '2026-08-01T00:00:00.000Z',
  maturesAt: '2026-08-31T00:00:00.000Z',
  accruedInterest: money('1232'),
  currentValue: money('251232'),
  maturityValue: money('253698'),
};

describe('PositionSaleRow', () => {
  it('leads with the item rather than with a chart', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    expect(screen.getByText('One kilogram gold bar, cast')).toBeTruthy();
    expect(screen.queryByTestId('sale-chart')).toBeNull();
  });

  /* The four a buyer compares down a column, all on the row so nothing has to
     be opened to compare two positions. */
  it('states the principal, today, maturity and the price', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('figure-principal').textContent).toBe('USD 2,500.00');
    expect(screen.getByTestId('figure-current').textContent).toBe('USD 2,512.32');
    expect(screen.getByTestId('figure-maturity').textContent).toBe('USD 2,536.98');
    expect(screen.getByTestId('figure-ask').textContent).toBe('USD 2,450.00');
  });

  it('states the discount, because the discount is the product', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('sale-discount').textContent).toContain('62.32');
    expect(screen.getByTestId('sale-discount').textContent).toContain('2.4%');
  });

  it('hands the press to the caller and says whether it is the chosen one', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <PositionSaleRow sale={sale} isSelected={false} onSelect={onSelect} />,
    );
    const row = screen.getByTestId('sale-row');
    expect(row.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(<PositionSaleRow sale={sale} isSelected onSelect={onSelect} />);
    expect(screen.getByTestId('sale-row').getAttribute('aria-pressed')).toBe('true');
  });
});
