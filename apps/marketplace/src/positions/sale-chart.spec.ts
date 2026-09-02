import { describe, expect, it } from 'vitest';
import type { NoteSaleSummary } from '@depawn/contracts';
import { discountOf, saleChartSeriesOf } from './sale-chart';

function money(minorUnits: string): { minorUnits: string; currency: string } {
  return { minorUnits, currency: 'USD' };
}

const startedAt = '2026-08-01T00:00:00.000Z';
const maturesAt = '2026-08-31T00:00:00.000Z';
const asOfMs = Date.parse('2026-08-11T00:00:00.000Z');

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
  maturesAt,
  accruedInterest: money('1232'),
  currentValue: money('251232'),
  maturityValue: money('253698'),
};

describe('saleChartSeriesOf', () => {
  it('draws the value from principal through today to the full payoff', () => {
    const [value] = saleChartSeriesOf(sale, asOfMs);
    expect(value?.role).toBe('subject');
    expect(value?.points.map((point) => point.minorUnits)).toEqual([250000n, 251232n, 253698n]);
    expect(value?.points.map((point) => point.atMs)).toEqual([
      Date.parse(startedAt),
      asOfMs,
      Date.parse(maturesAt),
    ]);
  });

  it('draws the ask flat across the term as the reference', () => {
    const [, ask] = saleChartSeriesOf(sale, asOfMs);
    expect(ask?.role).toBe('reference');
    expect(ask?.points).toHaveLength(2);
    expect(ask?.points.every((point) => point.minorUnits === 245000n)).toBe(true);
  });

  it('carries a subject point exactly at asOf so the today marker lands', () => {
    const [value] = saleChartSeriesOf(sale, asOfMs);
    expect(value?.points.some((point) => point.atMs === asOfMs)).toBe(true);
  });
});

describe('discountOf', () => {
  it('states the gap between today and the ask in money and in share', () => {
    const discount = discountOf(sale);
    expect(discount.minorUnits).toBe(6232n);
    // 6232 over 251232 truncates to 248 basis points.
    expect(discount.basisPoints).toBe(248);
  });
});
