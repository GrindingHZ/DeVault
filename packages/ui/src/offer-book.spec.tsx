import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferBook } from './offer-book';

function offer(id: string, basisPoints: number, interestMinorUnits: string, isMine = false) {
  return {
    id,
    annualPercentageRateBasisPoints: basisPoints,
    principal: { minorUnits: '400000' },
    totalCostToBorrower: { minorUnits: interestMinorUnits, currency: 'AUD' },
    isMine,
  };
}

const book = [offer('c', 2000, '6575'), offer('a', 1100, '3616'), offer('b', 1600, '5260')];

describe('OfferBook', () => {
  it('lists every offer cheapest first', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    const rates = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('button')?.textContent ?? '',
    );
    expect(rates[0]).toContain('11.00');
    expect(rates[1]).toContain('16.00');
    expect(rates[2]).toContain('20.00');
  });

  /* A lender's question is never "what rates exist", it is "where am I". */
  it('numbers the rows so a position can be read off', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    const ranks = [...container.querySelectorAll('tbody tr button span:first-child')].map(
      (node) => node.textContent,
    );
    expect(ranks).toEqual(['1', '2', '3']);
  });

  /* docs/DESIGN-BRIEF.md rule 3: colour is never the only signal. */
  it('marks the winning offer with a marker as well as a colour', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.querySelectorAll('tbody tr[data-best="true"]')).toHaveLength(1);
  });

  it('shows what each offer costs to repay', () => {
    render(<OfferBook offers={[offer('a', 1100, '3616')]} role="borrower" currency="AUD" />);
    expect(screen.getByText('AUD 4,036.16')).toBeTruthy();
  });

  /* The replacement for a depth column, which stopped meaning anything once
     every offer was for the same amount. */
  it('states what each offer costs above the cheapest', () => {
    render(<OfferBook offers={book} role="borrower" currency="AUD" />);
    expect(screen.getByText('+AUD 16.44')).toBeTruthy();
    expect(screen.getByText('+AUD 29.59')).toBeTruthy();
  });

  it('leaves the best row with no premium to state', () => {
    const { container } = render(<OfferBook offers={book} role="borrower" currency="AUD" />);
    const first = container.querySelector('tbody tr');
    expect(first?.textContent).toContain('-');
  });

  it('has no cumulative column', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.textContent).not.toContain('Cumulative');
  });

  it('finds the reader own offer without them reading every row', () => {
    const { container } = render(
      <OfferBook offers={[offer('a', 1100, '3616', true)]} role="lender" currency="AUD" />,
    );
    expect(container.querySelector('tbody tr[data-mine="true"]')).toBeTruthy();
    expect(screen.getByText('you')).toBeTruthy();
  });

  it('tells the caller which offer was chosen', () => {
    const onSelectOffer = vi.fn();
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="AUD" onSelectOffer={onSelectOffer} />,
    );
    fireEvent.click(container.querySelector('tbody tr button') as Element);
    expect(onSelectOffer).toHaveBeenCalledWith('a');
  });

  it('reaches every row from the keyboard', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(container.querySelectorAll('tbody button')).toHaveLength(3);
  });

  it('marks the selected row for assistive technology', () => {
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="AUD" selectedOfferId="b" />,
    );
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain('16.00');
  });

  /* A book longer than its window has to say what it holds, or a reader who
     can see four rows cannot tell whether there are five or fifty. */
  it('summarises how many offers there are and the spread', () => {
    render(<OfferBook offers={book} role="lender" currency="AUD" />);
    expect(screen.getByText('3 offers')).toBeTruthy();
    expect(screen.getByText(/11\.00% to 20\.00%/)).toBeTruthy();
  });

  it('states no spread when there is only one offer', () => {
    render(<OfferBook offers={[offer('a', 1100, '3616')]} role="lender" currency="AUD" />);
    expect(screen.getByText('1 offer')).toBeTruthy();
    expect(screen.queryByText(/ to /)).toBeNull();
  });

  it('does not divide by a book where every offer costs the same', () => {
    const { container } = render(
      <OfferBook
        offers={[offer('a', 1100, '3616'), offer('b', 1100, '3616')]}
        role="lender"
        currency="AUD"
      />,
    );
    expect(container.innerHTML).not.toContain('NaN');
  });

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
