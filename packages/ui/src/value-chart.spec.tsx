import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValueChart } from './value-chart';

const day = 24 * 60 * 60 * 1000;
const start = Date.parse('2026-08-01T00:00:00.000Z');

const total = {
  id: 'total',
  label: 'Total capital',
  role: 'subject' as const,
  points: [
    { atMs: start, minorUnits: 1000000n },
    { atMs: start + day, minorUnits: 1020000n },
    { atMs: start + 2 * day, minorUnits: 1050000n },
  ],
};

const cash = {
  id: 'cash',
  label: 'Cash in wallet',
  role: 'reference' as const,
  points: [
    { atMs: start, minorUnits: 1000000n },
    { atMs: start + day, minorUnits: 600000n },
    { atMs: start + 2 * day, minorUnits: 600000n },
  ],
};

describe('ValueChart', () => {
  it('names itself for a reader who cannot see a shape', () => {
    render(<ValueChart series={[total, cash]} currency="USD" label="Total capital over 1 month" />);
    expect(screen.getByRole('img', { name: 'Total capital over 1 month' })).toBeTruthy();
  });

  /* Identity is never colour alone. Two series means a key, always. */
  it('keys every series in words as well as in colour', () => {
    render(<ValueChart series={[total, cash]} currency="USD" label="Capital" />);
    expect(screen.getByText('Total capital')).toBeTruthy();
    expect(screen.getByText('Cash in wallet')).toBeTruthy();
  });

  it('draws one line per series', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" testId="capital" />,
    );
    expect(container.querySelectorAll('path[stroke-width="2"]')).toHaveLength(2);
  });

  /* Two filled areas on one scale read as a stack, which would claim the
     series add up. Only the subject is filled. */
  it('fills the subject and not the reference', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" />,
    );
    expect(container.querySelectorAll('path.fill-accent')).toHaveLength(1);
    expect(container.querySelectorAll('path.fill-status-active')).toHaveLength(0);
  });

  it('states the scale rather than leaving it to be guessed at', () => {
    render(<ValueChart series={[total, cash]} currency="USD" label="Capital" />);
    expect(screen.getByText('to')).toBeTruthy();
  });

  it('reads out both series where the pointer is', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" testId="capital" />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
    fireEvent.pointerMove(surface, { clientX: 300 });
    const tooltip = screen.getByTestId('capital-tooltip');
    expect(tooltip.textContent).toContain('10,500.00');
    expect(tooltip.textContent).toContain('6,000.00');
  });

  it('puts the readout away when the pointer leaves', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" testId="capital" />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
    fireEvent.pointerMove(surface, { clientX: 150 });
    expect(screen.queryByTestId('capital-tooltip')).toBeTruthy();
    fireEvent.pointerLeave(surface);
    expect(screen.queryByTestId('capital-tooltip')).toBeNull();
  });

  /* A blank rectangle reads as something that failed to load. */
  it('says plainly when there is nothing to draw', () => {
    render(<ValueChart series={[]} currency="USD" label="Capital" />);
    expect(screen.getByText(/Nothing has moved yet/)).toBeTruthy();
  });

  it('draws a flat series through the middle rather than dividing by zero', () => {
    const flat = {
      id: 'flat',
      label: 'Flat',
      role: 'subject' as const,
      points: [
        { atMs: start, minorUnits: 500n },
        { atMs: start + day, minorUnits: 500n },
      ],
    };
    const { container } = render(<ValueChart series={[flat]} currency="USD" label="Flat" />);
    expect(container.querySelector('path[stroke-width="2"]')?.getAttribute('d')).toContain('17.00');
  });
});
