import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tape } from './tape';
import type { TapeItem } from './tape';

const items: TapeItem[] = [
  {
    at: '2026-08-19T11:59:59.000Z',
    kind: 'OFFER_PLACED',
    listingId: 'L1',
    itemDescription: 'Rolex Submariner 116610LN',
    rateBasisPoints: 1120,
    amount: { minorUnits: '800000', currency: 'USD' },
  },
  {
    at: '2026-08-19T11:51:03.000Z',
    kind: 'LOAN_ORIGINATED',
    listingId: 'L2',
    itemDescription: 'Gold bar, 100g, PAMP Suisse',
    rateBasisPoints: 840,
    amount: { minorUnits: '550000', currency: 'USD' },
  },
];

describe('Tape', () => {
  it('names the item rather than the listing id', () => {
    render(<Tape items={items} />);
    expect(screen.getAllByText('Rolex Submariner 116610LN').length).toBeGreaterThan(0);
    expect(screen.queryByText('L1')).toBeNull();
  });

  it('keeps the order it was given, which is newest first', () => {
    const { container } = render(<Tape items={items} />);
    const rows = [...container.querySelectorAll('[role="log"] button')];
    expect(rows[0]?.textContent).toContain('Rolex');
    expect(rows[1]?.textContent).toContain('Gold bar');
  });

  it('says what happened in words, not with a colour', () => {
    render(<Tape items={items} />);
    expect(screen.getAllByText('offered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('funded').length).toBeGreaterThan(0);
  });

  it('selects the listing behind a line', () => {
    const onSelectListing = vi.fn();
    render(<Tape items={items} onSelectListing={onSelectListing} />);
    fireEvent.click(screen.getAllByText('Rolex Submariner 116610LN')[0] as HTMLElement);
    expect(onSelectListing).toHaveBeenCalledWith('L1');
  });

  it('survives a timestamp it cannot read', () => {
    render(<Tape items={[{ ...items[0], at: 'not a date' } as TapeItem]} />);
    expect(screen.getAllByText('Rolex Submariner 116610LN').length).toBeGreaterThan(0);
  });

  /* Announcing every offer would talk over a screen reader user who is
     trying to read the book. The tape is available, not insistent. */
  it('does not announce itself continuously', () => {
    const { container } = render(<Tape items={items} />);
    expect(container.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('off');
  });

  it('renders nothing at all when the market is quiet', () => {
    const { container } = render(<Tape items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Tape movement', () => {
  /* WCAG 2.2.2: anything that moves for more than five seconds needs a
     mechanism to stop it, and hovering is not one for somebody who is not
     using a pointer. */
  it('can be stopped and started', () => {
    render(<Tape items={items} />);
    const control = screen.getByTestId('tape-pause');
    expect(control.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(control);
    expect(control.getAttribute('aria-pressed')).toBe('true');
  });

  it('holds the track still while it is paused', () => {
    const { container } = render(<Tape items={items} />);
    fireEvent.click(screen.getByTestId('tape-pause'));
    const track = container.querySelector('[data-ticker]');
    expect(track?.getAttribute('data-paused')).toBe('true');
  });

  /* The loop has no seam because the events are rendered twice. The copy is
     hidden, or a screen reader would read the whole tape through again. */
  it('hides the duplicated track from a screen reader', () => {
    const { container } = render(<Tape items={items} />);
    const tracks = container.querySelectorAll('[data-ticker] > div');
    expect(tracks).toHaveLength(2);
    expect(tracks[1]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the duplicate out of the tab order', () => {
    const { container } = render(<Tape items={items} />);
    const duplicated = container.querySelectorAll('[aria-hidden="true"] button');
    expect([...duplicated].every((node) => node.getAttribute('tabindex') === '-1')).toBe(true);
  });
});
