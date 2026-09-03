import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurrencyMark } from './currency-mark';

describe('CurrencyMark', () => {
  it('draws the coin for the settlement coin', () => {
    render(<CurrencyMark currency="USDC" />);
    const mark = screen.getByRole('img', { name: 'USDC' });
    /* Inlined as a data url or served from a file, either way it is the svg. */
    expect(mark.getAttribute('src')).toContain('svg');
  });

  /* The mark is Circle's and stands for one coin. Any other currency is
     still spelled out, the way a reader would be told which dollar. */
  it('spells any other currency out', () => {
    const { container } = render(<CurrencyMark currency="USD" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('USD');
  });
});
