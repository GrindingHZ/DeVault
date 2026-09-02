import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollateralBar } from './collateral-bar';

const money = (minorUnits: string) => ({ minorUnits, currency: 'AUD' });

describe('CollateralBar', () => {
  it('states all three figures', () => {
    render(
      <CollateralBar
        appraisedValue={money('1100000')}
        requestedPrincipal={money('400000')}
        maxPrincipal={money('550000')}
        loanToValueBasisPoints={3636}
      />,
    );
    expect(screen.getByText('AUD 11,000.00')).toBeTruthy();
    expect(screen.getByText('AUD 4,000.00')).toBeTruthy();
    expect(screen.getByText('AUD 5,500.00')).toBeTruthy();
  });

  /* Since lenders compete on rate alone, nobody can use the room under the
     cap, so offering it as a figure invited lending more than the borrower
     asked for. What the cap is for now is making the share readable. */
  it('says what the category allows rather than what is left', () => {
    render(
      <CollateralBar
        appraisedValue={money('1100000')}
        requestedPrincipal={money('400000')}
        maxPrincipal={money('550000')}
        loanToValueBasisPoints={3636}
      />,
    );
    expect(screen.getByText(/lent against up to 50\.00%/)).toBeTruthy();
    expect(screen.queryByText(/room left/)).toBeNull();
  });

  it('never invites a lender to fill the headroom', () => {
    render(
      <CollateralBar
        appraisedValue={money('1100000')}
        requestedPrincipal={money('400000')}
        maxPrincipal={money('550000')}
        loanToValueBasisPoints={3636}
      />,
    );
    expect(screen.queryByText(/you could lend/i)).toBeNull();
  });

  /* A bar is a picture, and a picture that says nothing to a screen reader
     is three figures somebody cannot get at. */
  it('describes itself in words', () => {
    render(
      <CollateralBar
        appraisedValue={money('1100000')}
        requestedPrincipal={money('400000')}
        maxPrincipal={money('550000')}
        loanToValueBasisPoints={3636}
      />,
    );
    const bar = screen.getByRole('img');
    expect(bar.getAttribute('aria-label')).toContain('AUD 4,000.00 borrowed');
    expect(bar.getAttribute('aria-label')).toContain('AUD 11,000.00');
  });

  it('never divides by an appraisal of nothing', () => {
    const { container } = render(
      <CollateralBar
        appraisedValue={money('0')}
        requestedPrincipal={money('400000')}
        maxPrincipal={money('550000')}
        loanToValueBasisPoints={0}
      />,
    );
    expect(container.innerHTML).not.toContain('NaN');
    expect(container.innerHTML).not.toContain('Infinity');
  });
});
