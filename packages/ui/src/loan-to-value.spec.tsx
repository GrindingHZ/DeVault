import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoanToValue } from './loan-to-value';

/* The real caps, from the protocol parameters. */
const bullion = 6000;
const watch = 5000;
const collectible = 3500;
const art = 3000;

function toneOf(basisPoints: number, capBasisPoints: number): string {
  const { container } = render(
    <LoanToValue basisPoints={basisPoints} capBasisPoints={capBasisPoints} />,
  );
  return container.firstElementChild?.className ?? '';
}

describe('LoanToValue', () => {
  it('states the ratio with integer arithmetic', () => {
    render(<LoanToValue basisPoints={2145} capBasisPoints={watch} />);
    /* 21.45 is not representable, and toFixed(1) lands on 21.4. */
    expect(screen.getByText('21.5% LTV')).toBeTruthy();
  });

  it('drops a trailing zero rather than showing 30.0', () => {
    render(<LoanToValue basisPoints={3000} capBasisPoints={bullion} />);
    expect(screen.getByText('30% LTV')).toBeTruthy();
  });
});

/* The bug this replaced: absolute bands of 30 and 50 judged every category
   the same way, and the caps run from 60 down to 30. Four of the five read
   backwards. */
describe('LoanToValue against the category limit', () => {
  it('calls a painting at its limit near the limit, not comfortable', () => {
    expect(toneOf(3000, art)).toContain('text-status-warning');
  });

  it('calls a collectible just under its limit near the limit', () => {
    expect(toneOf(3400, collectible)).toContain('text-status-warning');
  });

  it('calls bullion well inside its limit comfortable', () => {
    expect(toneOf(3000, bullion)).toContain('text-status-success');
  });

  it('still calls a watch at its limit near the limit', () => {
    expect(toneOf(5000, watch)).toContain('text-status-warning');
  });

  it('reads the middle of the allowance as moderate', () => {
    /* 35% of a 50% cap is 70% of the allowance. */
    expect(toneOf(3500, watch)).toContain('text-status-active');
  });

  it('explains itself on hover in both figures', () => {
    render(<LoanToValue basisPoints={3000} capBasisPoints={bullion} testId="ltv" />);
    const title = screen.getByTestId('ltv').getAttribute('title') ?? '';
    expect(title).toContain('30% of the appraisal');
    expect(title).toContain('limit of 60%');
  });

  /* A wrong reassurance is worse than none. */
  it('claims nothing about risk when it has no limit to judge against', () => {
    const { container } = render(<LoanToValue basisPoints={3000} />);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('text-ink-secondary');
    expect(className).not.toContain('text-status-success');
  });

  it('does not divide by a category that lends nothing', () => {
    expect(toneOf(3000, 0)).toContain('text-status-warning');
  });
});
