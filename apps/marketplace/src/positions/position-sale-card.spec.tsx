import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSaleSummary } from '@depawn/contracts';
import { PositionSaleCard } from './position-sale-card';

function money(minorUnits: string): { minorUnits: string; currency: string } {
  return { minorUnits, currency: 'USD' };
}

const startedAt = '2026-08-01T00:00:00.000Z';

const sale: NoteSaleSummary = {
  id: 'SALE1',
  loanId: 'LOAN1',
  lenderNoteId: 'LN1',
  sellerAccountId: 'SELLER',
  status: 'OPEN',
  askPrice: money('245000'),
  createdAt: startedAt,
  itemDescription: 'One kilogram gold bar, cast',
  itemCategory: 'BULLION',
  principal: money('250000'),
  annualPercentageRateBasisPoints: 1800,
  startedAt,
  maturesAt: '2026-08-31T00:00:00.000Z',
  accruedInterest: money('1232'),
  currentValue: money('251232'),
  maturityValue: money('253698'),
};

const asOfMs = Date.parse('2026-08-11T00:00:00.000Z');

describe('PositionSaleCard', () => {
  it('names the item and states the three figures a buyer compares', () => {
    render(<PositionSaleCard sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByText('One kilogram gold bar, cast')).toBeTruthy();
    expect(screen.getByText('USD 2,512.32')).toBeTruthy();
    expect(screen.getByText('USD 2,536.98')).toBeTruthy();
    expect(screen.getByText('USD 2,450.00')).toBeTruthy();
  });

  it('draws the value chart with the ask as its reference', () => {
    render(<PositionSaleCard sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('sale-chart')).toBeTruthy();
    expect(screen.getByText('Position value')).toBeTruthy();
    expect(screen.getByText('Asking price')).toBeTruthy();
  });

  it('states the discount, because the discount is the product', () => {
    render(<PositionSaleCard sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('sale-discount').textContent).toContain('62.32');
    expect(screen.getByTestId('sale-discount').textContent).toContain('2.4%');
  });

  it('hands the buy press to the caller', () => {
    const onBuy = vi.fn();
    render(<PositionSaleCard sale={sale} asOfMs={asOfMs} onBuy={onBuy} />);
    fireEvent.click(screen.getByTestId('buy-position'));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });
});
