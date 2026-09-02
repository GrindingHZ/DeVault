import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferBook } from './offer-book';

function offer(id: string, basisPoints: number, minorUnits: string, isMine = false) {
  return {
    id,
    annualPercentageRateBasisPoints: basisPoints,
    principal: { minorUnits },
    isMine,
  };
}

const book = [offer('c', 1200, '250000'), offer('a', 1120, '800000'), offer('b', 1180, '500000')];

describe('OfferBook', () => {
  it('lists every offer cheapest first', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    const rates = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('button')?.textContent ?? '',
    );
    expect(rates[0]).toContain('11.20');
    expect(rates[1]).toContain('11.80');
    expect(rates[2]).toContain('12.00');
  });

  /* docs/DESIGN-BRIEF.md rule 3: colour is never the only signal. */
  it('marks the winning offer with a word, not only a colour', () => {
    render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(screen.getByText('best')).toBeTruthy();
  });

  it('marks exactly one row as best', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.querySelectorAll('tbody tr[data-best="true"]')).toHaveLength(1);
  });

  /* Lenders compete on rate, not on amount, so every offer is for the sum
     the borrower asked for and a depth column would be a row count. What a
     reader decides on is the rate and what it costs to repay. */
  it('shows what each offer costs to repay rather than a depth ladder', () => {
    render(
      <OfferBook
        offers={[
          {
            ...offer('a', 1120, '800000'),
            totalCostToBorrower: { minorUnits: '24600', currency: 'AUD' },
          },
        ]}
        role="borrower"
        currency="AUD"
      />,
    );
    expect(screen.getByText('AUD 8,246.00')).toBeTruthy();
  });

  it('has no cumulative column', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.textContent).not.toContain('Cumulative');
  });

  it('treats a missing interest figure as nothing rather than as broken', () => {
    render(<OfferBook offers={[offer('a', 1120, '800000')]} role="borrower" currency="AUD" />);
    expect(screen.getByText('AUD 8,000.00')).toBeTruthy();
  });

  it('tells the caller which offer was chosen', () => {
    const onSelectOffer = vi.fn();
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="AUD" onSelectOffer={onSelectOffer} />,
    );
    const firstRow = container.querySelector('tbody tr button');
    fireEvent.click(firstRow as Element);
    expect(onSelectOffer).toHaveBeenCalledWith('a');
  });

  it('reaches every row from the keyboard', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.querySelectorAll('tbody button')).toHaveLength(3);
  });

  it('shows which offer is the reader own', () => {
    render(<OfferBook offers={[offer('a', 1120, '800000', true)]} role="lender" currency="AUD" />);
    expect(screen.getByText('yours')).toBeTruthy();
  });

  it('marks the selected row for assistive technology', () => {
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="AUD" selectedOfferId="b" />,
    );
    const pressed = container.querySelector('button[aria-pressed="true"]');
    expect(pressed?.textContent).toContain('11.80');
  });

  /* An empty book is the normal state of a listing in its first minutes, so
     it gets a sentence rather than a bare table with no rows. */
  it('says something useful when nobody has offered', () => {
    render(<OfferBook offers={[]} role="borrower" currency="AUD" />);
    expect(screen.getByText('No offers yet')).toBeTruthy();
  });

  it('reads the empty book differently to each side', () => {
    const { unmount } = render(<OfferBook offers={[]} role="borrower" currency="AUD" />);
    expect(screen.getByText(/rate you pay/i)).toBeTruthy();
    unmount();

    render(<OfferBook offers={[]} role="lender" currency="AUD" />);
    expect(screen.getByText(/rate to beat/i)).toBeTruthy();
  });
});
