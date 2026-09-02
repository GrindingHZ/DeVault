import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryStrip } from './summary-strip';

describe('SummaryStrip', () => {
  it('names every figure it shows', () => {
    render(
      <SummaryStrip
        figures={[
          { label: 'Borrowed', value: 'USD 4,000.00' },
          { label: 'Lent', value: 'USD 7,200.00' },
        ]}
      />,
    );
    expect(screen.getByText('Borrowed')).toBeTruthy();
    expect(screen.getByText('USD 7,200.00')).toBeTruthy();
  });

  /* An empty space is not a zero. A reader who sees nothing cannot tell
     whether they owe nothing or the figure failed to load. */
  it('renders a zero rather than leaving a gap', () => {
    render(<SummaryStrip figures={[{ label: 'Borrowed', value: 'USD 0.00' }]} />);
    expect(screen.getByText('USD 0.00')).toBeTruthy();
  });

  it('marks an attention figure by more than its colour', () => {
    const { container } = render(
      <SummaryStrip figures={[{ label: 'Needs you', value: 2, tone: 'attention' }]} />,
    );
    expect(container.querySelector('[data-tone="attention"]')).toBeTruthy();
  });

  it('leaves an ordinary figure unmarked', () => {
    const { container } = render(<SummaryStrip figures={[{ label: 'Lent', value: 'USD 1.00' }]} />);
    expect(container.querySelector('[data-tone="attention"]')).toBeNull();
  });

  /* A figure is compared to the one beside it, so it takes the figure face
     and tabular numerals rather than the monospace (DESIGN-BRIEF, P8g). */
  it('sets its figures to align', () => {
    const { container } = render(<SummaryStrip figures={[{ label: 'Lent', value: '1' }]} />);
    expect(container.querySelector('dd')?.className).toContain('tabular-nums');
  });
});
