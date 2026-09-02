import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BestRate } from './best-rate';

function toneOf(container: HTMLElement): string | null {
  return container.querySelector('[data-tone]')?.getAttribute('data-tone') ?? null;
}

describe('BestRate for a lender', () => {
  /* The defect this component was pulled out of `MarketDelta` to fix. That
     one was handed the best rate against the second best, which are sorted,
     so it read "down" on every listing with two offers and painted the
     lender adverse whatever their standing. It said "you have been undercut"
     to the lender the book beneath ranked first. */
  it('is favourable to the lender holding the cheapest offer', () => {
    const { container } = render(
      <BestRate basisPoints={1408} role="lender" viewerStanding="leads" hasCompetition />,
    );
    expect(toneOf(container)).toBe('favourable');
    expect(screen.getByText(/cheapest offer/i)).toBeTruthy();
    expect(screen.queryByText(/undercut/i)).toBeNull();
  });

  it('is adverse to the lender who has been undercut', () => {
    const { container } = render(
      <BestRate basisPoints={1408} role="lender" viewerStanding="behind" hasCompetition />,
    );
    expect(toneOf(container)).toBe('adverse');
    expect(screen.getByText(/undercut/i)).toBeTruthy();
  });

  /* A reader with nothing in the book is told about the book, not about
     themselves, and the colour claims nothing either. */
  it('says nothing about a lender who has not offered', () => {
    const { container } = render(
      <BestRate basisPoints={1408} role="lender" viewerStanding="absent" hasCompetition />,
    );
    expect(toneOf(container)).toBe('flat');
    expect(screen.queryByText(/undercut/i)).toBeNull();
    expect(screen.queryByText(/cheapest offer/i)).toBeNull();
  });

  /* Standing decides the tone, not how many other offers there are: a lender
     alone in the book still holds the cheapest offer in it. */
  it('keeps the standing rule when there is no competition', () => {
    const { container } = render(
      <BestRate basisPoints={1408} role="lender" viewerStanding="leads" hasCompetition={false} />,
    );
    expect(toneOf(container)).toBe('favourable');
  });
});

describe('BestRate for a borrower', () => {
  /* A borrower reads their own listing. Every offer is money offered to them
     and a lower rate is cheaper, so lenders undercutting each other is the
     mechanism working. Their own standing does not apply: nobody bids on
     their own item. */
  it('reads competition as favourable', () => {
    const { container } = render(
      <BestRate basisPoints={1408} role="borrower" viewerStanding="absent" hasCompetition />,
    );
    expect(toneOf(container)).toBe('favourable');
    expect(screen.getByText(/undercutting each other/i)).toBeTruthy();
  });

  it('claims nothing from a single offer', () => {
    const { container } = render(
      <BestRate
        basisPoints={1408}
        role="borrower"
        viewerStanding="absent"
        hasCompetition={false}
      />,
    );
    expect(toneOf(container)).toBe('flat');
    expect(screen.getByText(/nothing against it yet/i)).toBeTruthy();
  });
});

describe('BestRate, whoever reads it', () => {
  it('prints the rate itself', () => {
    render(<BestRate basisPoints={1408} role="lender" viewerStanding="leads" hasCompetition />);
    expect(screen.getByText('14.08% p.a.')).toBeTruthy();
  });

  /* Colour is never the only signal (docs/DESIGN-BRIEF.md rule 3). Every
     combination says what it means in words as well. */
  it.each([
    ['lender', 'leads'],
    ['lender', 'behind'],
    ['lender', 'absent'],
    ['borrower', 'absent'],
  ] as const)('spells out the reading for a %s who %s', (role, standing) => {
    const { container } = render(
      <BestRate basisPoints={1408} role={role} viewerStanding={standing} hasCompetition />,
    );
    const words = container.querySelectorAll('span');
    expect([...words].some((one) => (one.textContent ?? '').length > 12)).toBe(true);
  });
});
