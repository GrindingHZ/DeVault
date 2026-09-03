import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money, formatMoney } from './money';

describe('Money', () => {
  it('formats minor units with grouping and two decimals', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'USD' }, 'en-US')).toBe('USD 2,500.00');
    expect(formatMoney({ minorUnits: '5', currency: 'USD' }, 'en-US')).toBe('USD 0.05');
  });

  it('formats negative amounts', () => {
    expect(formatMoney({ minorUnits: '-9950', currency: 'USD' }, 'en-US')).toBe('USD -99.50');
  });

  it('renders values beyond the safe integer range exactly', () => {
    expect(formatMoney({ minorUnits: '9007199254740993', currency: 'USD' }, 'en-US')).toBe(
      'USD 90,071,992,547,409.93',
    );
  });

  /* The settlement coin is drawn rather than spelled, everywhere a figure
     carries it. The code stays in the image's name for a screen reader. */
  it('draws the usdc mark in place of the code', () => {
    render(<Money value={{ minorUnits: '250', currency: 'USDC' }} locale="en-US" />);
    expect(screen.getByRole('img', { name: 'USDC' })).toBeTruthy();
    expect(screen.getByText('2.50')).toBeTruthy();
    expect(screen.queryByText(/USDC/)).toBeNull();
  });

  it('renders as a span from the wire shape', () => {
    render(<Money value={{ minorUnits: '123456', currency: 'USD' }} />);
    expect(screen.getByText('USD 1,234.56')).toBeTruthy();
  });

  /* How many minor units make a major one is a property of the currency. The
     yen has none, so a hundred minor units is a hundred yen, not one. */
  it('respects the currency, not a two decimal assumption', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'JPY' }, 'en-US')).toBe('JPY 250,000');
    expect(formatMoney({ minorUnits: '250000', currency: 'KWD' }, 'en-US')).toBe('KWD 250.000');
  });

  it('groups and separates the way the reader does', () => {
    expect(formatMoney({ minorUnits: '123456789', currency: 'EUR' }, 'de-DE')).toBe(
      'EUR 1.234.567,89',
    );
    expect(formatMoney({ minorUnits: '123456789', currency: 'EUR' }, 'en-US')).toBe(
      'EUR 1,234,567.89',
    );
  });

  /* A currency Intl has never heard of is still money somebody is owed, so
     it renders rather than throwing a screen of figures away. */
  it('falls back rather than failing on an unknown currency', () => {
    expect(formatMoney({ minorUnits: '250000', currency: 'ZZZ' }, 'en-US')).toBe('ZZZ 2,500.00');
  });

  it('keeps the exactness at scale in a currency with three decimals', () => {
    expect(formatMoney({ minorUnits: '9007199254740993', currency: 'KWD' }, 'en-US')).toBe(
      'KWD 9,007,199,254,740.993',
    );
  });
});
