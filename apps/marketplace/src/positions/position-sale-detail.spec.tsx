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

  it('repeats the trade figures beside the chart', () => {
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('figure-pay').textContent).toBe('USD 2,450.00');
    expect(screen.getByTestId('figure-receive').textContent).toBe('USD 2,536.98');
    expect(screen.getByTestId('figure-profit').textContent).toContain('+USD 86.98');
  });

  /* Where the line stops being history and starts being what a buyer is
     buying. Without it a reader cannot tell which part is which. */
  it('marks today on the chart and names the mark', () => {
    render(<PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />);
    expect(screen.getByTestId('sale-chart-marked-label').textContent).toBe('Today');
  });

  it('reads out the profit for the day under the pointer', () => {
    const { container } = render(
      <PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 600 }) as DOMRect;

    fireEvent.pointerMove(surface, { clientX: 600 });
    const tooltip = screen.getByTestId('sale-chart-tooltip');
    // Held to maturity: 2536.98 back against 2450.00 paid.
    expect(tooltip.textContent).toContain('Profit if you buy now');
    expect(tooltip.textContent).toContain('+USD 86.98');
    expect(tooltip.textContent).toContain('3.5%');
  });

  /* Nobody can buy into a day that has already passed, so the gap there is
     not a profit and is not called one. */
  it('offers no profit for a day before today', () => {
    const { container } = render(
      <PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 600 }) as DOMRect;

    fireEvent.pointerMove(surface, { clientX: 0 });
    const tooltip = screen.getByTestId('sale-chart-tooltip');
    expect(tooltip.textContent).toContain('Before it was for sale');
    expect(tooltip.textContent).not.toContain('Profit if you buy now');
  });

  /* The readout travels with the pointer rather than sitting at a fixed end,
     so the figures are beside the part of the line being read. */
  it('follows the pointer along the plot', () => {
    const { container } = render(
      <PositionSaleDetail sale={sale} asOfMs={asOfMs} onBuy={() => undefined} />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 600 }) as DOMRect;

    fireEvent.pointerMove(surface, { clientX: 0 });
    const atStart = Number(screen.getByTestId('sale-chart-tooltip').style.left.replace('px', ''));
    fireEvent.pointerMove(surface, { clientX: 600 });
    const atEnd = Number(screen.getByTestId('sale-chart-tooltip').style.left.replace('px', ''));
    expect(atEnd).toBeGreaterThan(atStart);
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
