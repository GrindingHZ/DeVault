import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Percentage, formatPercentage } from './percentage';

describe('formatPercentage', () => {
  /* The reason this exists: Rate says "p.a." because a loan is quoted per
     annum, and a share of an insured limit is not quoted at all. */
  it('says nothing about a period', () => {
    expect(formatPercentage(360)).toBe('3.60%');
    expect(formatPercentage(360)).not.toContain('p.a.');
  });

  it('keeps two places and the sign', () => {
    expect(formatPercentage(10_000)).toBe('100.00%');
    expect(formatPercentage(5)).toBe('0.05%');
    expect(formatPercentage(-250)).toBe('-2.50%');
  });

  it('renders', () => {
    render(<Percentage basisPoints={5797} />);
    expect(screen.getByText('57.97%')).toBeTruthy();
  });
});
