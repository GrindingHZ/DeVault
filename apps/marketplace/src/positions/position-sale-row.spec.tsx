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

describe('PositionSaleRow', () => {
  it('leads with the item rather than with a chart', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    expect(screen.getByText('One kilogram gold bar, cast')).toBeTruthy();
    expect(screen.getByTestId('sale-photograph')).toBeTruthy();
    expect(screen.queryByTestId('sale-chart')).toBeNull();
  });

  /* The date is what a reader compares down the column, so it is the only
     part of the line carrying weight. */
  it('bolds the maturity date and nothing else on the term line', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    const date = screen.getByTestId('matures-on');
    expect(date.tagName).toBe('STRONG');
    expect(date.textContent).not.toContain('matures');
  });

  it('separates the term line with bars rather than dots', () => {
    const { container } = render(
      <PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />,
    );
    const separators = [...container.querySelectorAll('span[aria-hidden="true"]')].map(
      (node) => node.textContent,
    );
    expect(separators).toContain('|');
    expect(separators).not.toContain('·');
  });

  /* The two ends of the trade, large; the two that explain them, small. All
     four on the row so nothing has to be opened to compare two positions. */
  it('leads with what is paid and what comes back', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('figure-pay').textContent).toBe('USD 2,450.00');
    expect(screen.getByTestId('figure-receive').textContent).toBe('USD 2,536.98');
  });

  /* The two figures that are not set in full above the line are written on
     it, against their own dots, so no amount on the card is a dot a reader
     cannot put a number to. */
  it('writes the principal under the line and today over it', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    const principal = screen.getByTestId('sale-scale-value-principal');
    expect(principal.textContent).toContain('Principal');
    expect(principal.textContent).toContain('2,500.00');
    const today = screen.getByTestId('sale-scale-value-today');
    expect(today.textContent).toContain('Today');
    expect(today.textContent).toContain('2,512.32');
    /* Opposite sides, which is what keeps them apart on the day a position
       is listed and the two figures are the same number. */
    expect(Number(principal.style.top.replace('px', ''))).toBeGreaterThan(
      Number(today.style.top.replace('px', '')),
    );
  });

  /* The one figure in colour, because it is the one the decision turns on:
     2536.98 back for 2450.00 paid is 86.98, which is 355 basis points. */
  it('states the profit in money and in share', () => {
    render(<PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />);
    const profit = screen.getByTestId('figure-profit');
    expect(profit.textContent).toContain('+USD 86.98');
    expect(profit.textContent).toContain('3.5%');
    expect(profit.className).toContain('text-market-favourable');
  });

  /* The line is the part that makes four amounts comparable at a glance: the
     price opens it, maturity closes it, and the two stretches between are
     what the buyer gets now and what they get for waiting. */
  it('puts all four figures on one line at the distances they sit apart', () => {
    const { container } = render(
      <PositionSaleRow sale={sale} isSelected={false} onSelect={() => undefined} />,
    );
    for (const id of ['ask', 'principal', 'today', 'maturity']) {
      expect(container.querySelector(`[data-testid="sale-scale-mark-${id}"]`)).toBeTruthy();
    }
    expect(container.querySelector('[data-testid="sale-scale-segment-ask"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sale-scale-segment-today"]')).toBeTruthy();
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
