import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferBook } from './offer-book';

function offer(id: string, basisPoints: number, interestMinorUnits: string, isMine = false) {
  return {
    id,
    annualPercentageRateBasisPoints: basisPoints,
    principal: { minorUnits: '400000' },
    totalCostToBorrower: { minorUnits: interestMinorUnits, currency: 'USD' },
    isMine,
  };
}

const book = [offer('c', 2000, '6575'), offer('a', 1100, '3616'), offer('b', 1600, '5260')];

describe('OfferBook', () => {
  it('lists every offer cheapest first', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    const rates = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelectorAll('td')[1]?.textContent ?? '',
    );
    expect(rates[0]).toContain('11.00');
    expect(rates[1]).toContain('16.00');
    expect(rates[2]).toContain('20.00');
  });

  /* The bug this replaced: the rank and the rate shared one cell, so three
     columns of data sat under four headings and every heading from the
     second rightward named the column to its left. Counting the cells is
     the only assertion that catches it. */
  it('gives every row exactly one cell per heading', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    const headings = container.querySelectorAll('thead th').length;
    expect(headings).toBe(4);
    for (const row of container.querySelectorAll('tbody tr')) {
      expect(row.querySelectorAll('td')).toHaveLength(headings);
    }
  });

  it('keeps the columns aligned when the rows can be chosen', () => {
    const { container } = render(
      <OfferBook offers={book} role="borrower" currency="USD" onSelectOffer={() => {}} />,
    );
    const headings = container.querySelectorAll('thead th').length;
    for (const row of container.querySelectorAll('tbody tr')) {
      expect(row.querySelectorAll('td')).toHaveLength(headings);
    }
  });

  /* A lender's question is never "what rates exist", it is "where am I". */
  it('numbers the rows so a position can be read off', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    const ranks = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelectorAll('td')[0]?.textContent,
    );
    expect(ranks).toEqual(['1', '2', '3']);
  });

  /* docs/DESIGN-BRIEF.md rule 3: colour is never the only signal. */
  it('marks the winning offer with a marker as well as a colour', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(container.querySelectorAll('tbody tr[data-best="true"]')).toHaveLength(1);
  });

  it('shows what each offer costs to repay', () => {
    render(<OfferBook offers={[offer('a', 1100, '3616')]} role="borrower" currency="USD" />);
    expect(screen.getByText('USD 4,036.16')).toBeTruthy();
  });

  it('draws the coin on what each offer costs', () => {
    render(<OfferBook offers={[offer('a', 1100, '3616')]} role="borrower" currency="USDC" />);
    expect(screen.getAllByRole('img', { name: 'USDC' })).toHaveLength(1);
    expect(screen.getByText('4,036.16')).toBeTruthy();
  });

  /* The replacement for a depth column, which stopped meaning anything once
     every offer was for the same amount. */
  it('states what each offer costs above the cheapest', () => {
    render(<OfferBook offers={book} role="borrower" currency="USD" />);
    expect(screen.getByText('+USD 16.44')).toBeTruthy();
    expect(screen.getByText('+USD 29.59')).toBeTruthy();
  });

  it('leaves the best row with no premium to state', () => {
    const { container } = render(<OfferBook offers={book} role="borrower" currency="USD" />);
    const first = container.querySelector('tbody tr');
    expect(first?.textContent).toContain('-');
  });

  it('has no cumulative column', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(container.textContent).not.toContain('Cumulative');
  });

  it('finds the reader own offer without them reading every row', () => {
    const { container } = render(
      <OfferBook offers={[offer('a', 1100, '3616', true)]} role="lender" currency="USD" />,
    );
    expect(container.querySelector('tbody tr[data-mine="true"]')).toBeTruthy();
    expect(screen.getByText('you')).toBeTruthy();
  });

  it('tells the caller which offer was chosen', () => {
    const onSelectOffer = vi.fn();
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="USD" onSelectOffer={onSelectOffer} />,
    );
    fireEvent.click(container.querySelector('tbody input[type="radio"]') as Element);
    expect(onSelectOffer).toHaveBeenCalledWith('a');
  });

  /* One radio per row, sharing a name. Choosing an offer is choosing one of
     a set, which is the control the platform already has: the arrow keys
     move between them and a screen reader says which of how many. */
  it('offers one choice per row when the rows can be chosen', () => {
    const { container } = render(
      <OfferBook offers={book} role="borrower" currency="USD" onSelectOffer={() => {}} />,
    );
    const radios = [...container.querySelectorAll('tbody input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(1);
  });

  /* A book nobody can act on is a table, and a table does not need controls
     in it. Only the borrower accepts an offer, so only the borrower is given
     anything to choose with: a lender was being shown a column of radios
     that led nowhere. */
  it('holds no controls when there is nothing to choose', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(container.querySelectorAll('tbody input')).toHaveLength(0);
    expect(container.querySelectorAll('tbody label')).toHaveLength(0);
  });

  it('does not offer a choice to a viewer whose selection is ignored', () => {
    const { container } = render(
      <OfferBook offers={book} role="lender" currency="USD" selectedOfferId="b" />,
    );
    expect(container.querySelectorAll('tbody input[type="radio"]')).toHaveLength(0);
    /* And nothing is drawn as chosen either, or a lender arriving on a link
       carrying an offer id would see a row singled out for no reason. */
    expect(container.querySelectorAll('tbody tr[data-selected="true"]')).toHaveLength(0);
  });

  it('says the column is for choosing only when it is', () => {
    const chooseable = render(
      <OfferBook offers={book} role="borrower" currency="USD" onSelectOffer={() => {}} />,
    );
    expect(chooseable.container.querySelector('thead th')?.textContent).toContain('Choose');
    chooseable.unmount();

    const readOnly = render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(readOnly.container.querySelector('thead th')?.textContent).toContain('Position');
  });

  it('names each choice in full, so it stands on its own when read aloud', () => {
    const { container } = render(
      <OfferBook offers={book} role="borrower" currency="USD" onSelectOffer={() => {}} />,
    );
    const first = container.querySelector('tbody input[type="radio"]');
    expect(first?.getAttribute('aria-label')).toContain('Offer 1');
    expect(first?.getAttribute('aria-label')).toContain('11.00%');
  });

  it('marks the selected row for assistive technology', () => {
    const { container } = render(
      <OfferBook
        offers={book}
        role="borrower"
        currency="USD"
        selectedOfferId="b"
        onSelectOffer={() => {}}
      />,
    );
    const checked = container.querySelector('tbody input[type="radio"]:checked');
    expect(checked?.getAttribute('aria-label')).toContain('16.00%');
    expect(container.querySelectorAll('tbody tr[data-selected="true"]')).toHaveLength(1);
  });

  /* A book longer than its window has to say what it holds, or a reader who
     can see four rows cannot tell whether there are five or fifty. */
  it('summarises how many offers there are and the spread', () => {
    render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(screen.getByText('3 offers')).toBeTruthy();
    expect(screen.getByText(/11\.00% to 20\.00%/)).toBeTruthy();
  });

  it('states no spread when there is only one offer', () => {
    render(<OfferBook offers={[offer('a', 1100, '3616')]} role="lender" currency="USD" />);
    expect(screen.getByText('1 offer')).toBeTruthy();
    expect(screen.queryByText(/ to /)).toBeNull();
  });

  it('does not divide by a book where every offer costs the same', () => {
    const { container } = render(
      <OfferBook
        offers={[offer('a', 1100, '3616'), offer('b', 1100, '3616')]}
        role="lender"
        currency="USD"
      />,
    );
    expect(container.innerHTML).not.toContain('NaN');
  });

  /* Every offer is a hold locked in escrow, and the book is where a reader
     checks that the money behind a rate is really there. */
  it('links each offer to its hold on chain when the book carries one', () => {
    const { container } = render(
      <OfferBook
        offers={book.map((one) => ({ ...one, chainObjectId: `0xhold-${one.id}` }))}
        role="lender"
        currency="USD"
      />,
    );
    const links = [...container.querySelectorAll('tbody a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      expect.stringContaining('/object/0xhold-a'),
      expect.stringContaining('/object/0xhold-b'),
      expect.stringContaining('/object/0xhold-c'),
    ]);
    /* Under the figures rather than beside them: a fifth column made the
       book scroll sideways, and a hash is not something a reader compares
       down a column anyway. The record spans the row, so the four headings
       still count the four cells above it. */
    expect(container.querySelectorAll('thead th')).toHaveLength(4);
    const records = container.querySelectorAll('tbody tr[data-chain-row]');
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record.querySelectorAll('td')).toHaveLength(1);
      expect(record.querySelector('td')?.getAttribute('colspan')).toBe('4');
    }
  });

  /* A hash on its own says nothing about what is at the end of it. */
  it('names the object each offer is backed by', () => {
    render(
      <OfferBook
        offers={[{ ...offer('a', 1100, '3616'), chainObjectId: '0xhold-a' }]}
        role="lender"
        currency="USD"
      />,
    );
    expect(screen.getByText('Escrow hold')).toBeTruthy();
    expect(screen.getByText('escrow::FundsHold')).toBeTruthy();
  });

  it('shows no chain record when no offer carries an object', () => {
    const { container } = render(<OfferBook offers={book} role="lender" currency="USD" />);
    expect(container.querySelectorAll('tbody a')).toHaveLength(0);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('says something useful when nobody has offered', () => {
    render(<OfferBook offers={[]} role="borrower" currency="USD" />);
    expect(screen.getByText('No offers yet')).toBeTruthy();
  });

  it('reads the empty book differently to each side', () => {
    const { unmount } = render(<OfferBook offers={[]} role="borrower" currency="USD" />);
    expect(screen.getByText(/rate you pay/i)).toBeTruthy();
    unmount();

    render(<OfferBook offers={[]} role="lender" currency="USD" />);
    expect(screen.getByText(/rate to beat/i)).toBeTruthy();
  });
});
