import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tape } from './tape';
import type { TapeItem } from './tape';

const items: TapeItem[] = [
  {
    listingId: 'L1',
    itemCategory: 'WATCH',
    categoryLabel: 'Watch',
    itemDescription: 'Rolex Submariner 116610LN',
    rateBasisPoints: 1120,
    amount: { minorUnits: '800000', currency: 'USD' },
  },
  {
    listingId: 'L2',
    itemCategory: 'BULLION',
    categoryLabel: 'Bullion',
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

  /* One coin per visible row. The second copy of the track is hidden from
     assistive technology and stays out of the count. */
  it('draws the coin on each amount', () => {
    render(
      <Tape
        items={items.map((item) => ({ ...item, amount: { ...item.amount, currency: 'USDC' } }))}
      />,
    );
    expect(screen.getAllByRole('img', { name: 'USDC' })).toHaveLength(2);
  });

  it('keeps the order it was given', () => {
    const { container } = render(<Tape items={items} />);
    const rows = [...container.querySelectorAll('[role="log"] button')];
    expect(rows[0]?.textContent).toContain('Rolex');
    expect(rows[1]?.textContent).toContain('Gold bar');
  });

  it('shows the category and the keenest rate for each listing', () => {
    render(<Tape items={items} />);
    expect(screen.getAllByText('Watch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bullion').length).toBeGreaterThan(0);
    expect(screen.getAllByText('11.20%').length).toBeGreaterThan(0);
  });

  it('selects the listing behind a line', () => {
    const onSelectListing = vi.fn();
    render(<Tape items={items} onSelectListing={onSelectListing} />);
    fireEvent.click(screen.getAllByText('Rolex Submariner 116610LN')[0] as HTMLElement);
    expect(onSelectListing).toHaveBeenCalledWith('L1');
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
