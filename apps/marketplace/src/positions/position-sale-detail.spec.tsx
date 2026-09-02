import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSaleSummary } from '@depawn/contracts';
import { PositionSaleDetail } from './position-sale-detail';

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
  receiptId: 'R1',
  itemDescription: 'One kilogram gold bar, cast',
  itemCategory: 'BULLION',
  hasPhotograph: true,
  principal: money('250000'),
  annualPercentageRateBasisPoints: 1800,
  startedAt: '2026-08-01T00:00:00.000Z',
  maturesAt: '2026-08-31T00:00:00.000Z',
  accruedInterest: money('1232'),
  currentValue: money('251232'),
  maturityValue: money('253698'),
};

const asOfMs = Date.parse('2026-08-11T00:00:00.000Z');

describe('PositionSaleDetail', () => {
  it('draws the value against the ask', () => {
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('sale-chart')).toBeTruthy();
    expect(screen.getByText('Position value')).toBeTruthy();
    expect(screen.getByText('Asking price')).toBeTruthy();
  });

  it('repeats the four figures beside the chart', () => {
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('detail-figure-principal').textContent).toBe('USD 2,500.00');
    expect(screen.getByTestId('detail-figure-current').textContent).toBe('USD 2,512.32');
    expect(screen.getByTestId('detail-figure-maturity').textContent).toBe('USD 2,536.98');
    expect(screen.getByTestId('detail-figure-ask').textContent).toBe('USD 2,450.00');
  });

  /* One curve per day of the term, which is what makes every day hoverable. */
  it('curves the value line through every day of the term', () => {
    const { container } = render(
      <PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />,
    );
    const line = container.querySelector('path[stroke-width="2"]');
    expect(line?.getAttribute('d')?.match(/C/g)).toHaveLength(30);
  });

  it('shows the item and bolds the date it matures', () => {
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('detail-photograph')).toBeTruthy();
    expect(screen.getByTestId('matures-on').tagName).toBe('STRONG');
  });

  it('reads out both lines for the day under the pointer', () => {
    const { container } = render(
      <PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 600 }) as DOMRect;
    fireEvent.pointerMove(surface, { clientX: 600 });

    const tooltip = screen.getByTestId('sale-chart-tooltip');
    // The last day: what it matures at, against the unchanged ask.
    expect(tooltip.textContent).toContain('2,536.98');
    expect(tooltip.textContent).toContain('2,450.00');
  });

  it('hands the buy press to the caller', () => {
    const onBuy = vi.fn();
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={onBuy} />);
    fireEvent.click(screen.getByTestId('buy-position'));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });
});
