import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TermBar } from './term-bar';

describe('TermBar', () => {
  /* Colour carries nothing on its own. A reader who cannot see the fill has
     to get the same answer from the note. */
  it('says in words what the bar says in length', () => {
    render(<TermBar elapsedBasisPoints={3667} note="38 days to maturity" tone="active" />);
    expect(screen.getByText('38 days to maturity')).toBeTruthy();
  });

  it('reports its value to assistive technology', () => {
    render(<TermBar elapsedBasisPoints={3667} note="38 days to maturity" tone="active" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('37');
    expect(bar.getAttribute('aria-valuetext')).toBe('38 days to maturity');
  });

  /* A term past maturity is clamped by the caller, but a bar that trusted
     its input would still paint outside its track. */
  it('never paints past full', () => {
    const { container } = render(
      <TermBar elapsedBasisPoints={99_999} note="grace has run out" tone="danger" />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('100%');
  });

  it('never paints a negative width', () => {
    const { container } = render(
      <TermBar elapsedBasisPoints={-500} note="not started" tone="neutral" />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('0%');
  });
});
