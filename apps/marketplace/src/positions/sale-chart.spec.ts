import { describe, expect, it } from 'vitest';
import type { NoteSaleSummary } from '@depawn/contracts';
import { discountOf, saleChartOf } from './sale-chart';

function money(minorUnits: string): { minorUnits: string; currency: string } {
  return { minorUnits, currency: 'USD' };
}

const startedAt = '2026-08-01T00:00:00.000Z';
const maturesAt = '2026-08-31T00:00:00.000Z';
const asOfMs = Date.parse('2026-08-11T00:00:00.000Z');
const oneDayMs = 24 * 60 * 60 * 1000;

/* 250000 at 1800 basis points: a thirty day term truncates to 3698, and the
   ten days elapsed to 1232, which is the same arithmetic the server accrues
   with and therefore the same figures it prices. */
const sale: NoteSaleSummary = {
  id: 'SALE1',
  loanId: 'LOAN1',
  lenderNoteId: 'LN1',
  sellerAccountId: 'SELLER',
  status: 'OPEN',
  askPrice: money('245000'),
  createdAt: startedAt,
  receiptId: 'R1',
  itemDescription: 'One kilogram gold bar, cast',
  itemCategory: 'BULLION',
  hasPhotograph: true,
  principal: money('250000'),
  annualPercentageRateBasisPoints: 1800,
  startedAt,
  maturesAt,
  accruedInterest: money('1232'),
  currentValue: money('251232'),
  maturityValue: money('253698'),
};

describe('saleChartOf', () => {
  it('puts a tick on every day of the term, ending on the day it matures', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    expect(value?.points).toHaveLength(31);
    expect(value?.points[0]?.atMs).toBe(Date.parse(startedAt));
    expect(value?.points.at(-1)?.atMs).toBe(Date.parse(maturesAt));
    const gaps = (value?.points ?? [])
      .slice(1)
      .map((point, index) => point.atMs - (value?.points[index]?.atMs ?? 0));
    expect(new Set(gaps)).toEqual(new Set([oneDayMs]));
  });

  it('starts at the principal, because that is what was lent', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    expect(value?.points[0]?.minorUnits).toBe(250000n);
  });

  /* The chart and the figures beside it are priced by the same arithmetic, so
     the line lands exactly on the server's figure rather than near it. */
  it('lands on the server priced maturity value on the last day', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    expect(value?.points.at(-1)?.minorUnits).toBe(BigInt(sale.maturityValue.minorUnits));
  });

  it('passes through the server priced value for today', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    const today = value?.points.find((point) => point.atMs === asOfMs);
    expect(today?.minorUnits).toBe(BigInt(sale.currentValue.minorUnits));
  });

  it('climbs a day at a time and never falls', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    const amounts = (value?.points ?? []).map((point) => point.minorUnits);
    for (const [index, amount] of amounts.slice(1).entries()) {
      expect(amount).toBeGreaterThan(amounts[index] ?? 0n);
    }
  });

  it('smooths the value line without letting it leave the days it joins', () => {
    const [value] = saleChartOf(sale, asOfMs).series;
    expect(value?.shape).toBe('smooth');
    expect(value?.role).toBe('subject');
  });

  /* Both lines on the same ticks is what lets a hover read out the value and
     the price for one day side by side. */
  it('holds the ask flat across the same ticks as the value', () => {
    const [value, ask] = saleChartOf(sale, asOfMs).series;
    expect(ask?.role).toBe('reference');
    expect(ask?.points.map((point) => point.atMs)).toEqual(
      value?.points.map((point) => point.atMs),
    );
    expect(new Set(ask?.points.map((point) => point.minorUnits))).toEqual(new Set([245000n]));
  });

  it('marks the day the loan is standing on', () => {
    expect(saleChartOf(sale, asOfMs).markedAtMs).toBe(asOfMs);
  });

  /* The mark has to sit on a tick a reader can hover, so a clock between two
     days snaps to the nearer one rather than floating between them. */
  it('snaps a mark between two days onto the nearer one', () => {
    const midday = asOfMs + oneDayMs * 0.4;
    expect(saleChartOf(sale, midday).markedAtMs).toBe(asOfMs);
  });

  it('survives a term with no length rather than dividing by zero', () => {
    const [value] = saleChartOf({ ...sale, maturesAt: startedAt }, asOfMs).series;
    expect(value?.points).toHaveLength(1);
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
