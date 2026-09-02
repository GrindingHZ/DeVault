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

  /* Up the side, where a scale belongs. Laid along the bottom it read as an
     x-axis and said nothing true about time. */
  it('states the scale beside the plot, high above low', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" />,
    );
    const axis = container.querySelector('[aria-hidden="true"].w-16');
    const labels = [...(axis?.querySelectorAll('span') ?? [])].map((node) => node.textContent);
    expect(labels).toHaveLength(2);
    expect(Number(labels[0]?.replace(/,/g, ''))).toBeGreaterThan(
      Number(labels[1]?.replace(/,/g, '')),
    );
  });

  /* The bug this replaced: the grid was 100 by 34 stretched to the width of
     the card, so a four pixel marker rendered 97 wide and 38 tall. Drawing in
     real pixels is what keeps a circle a circle. */
  it('never stretches its own coordinate system', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" />,
    );
    const svg = container.querySelector('svg[role="img"]');
    expect(svg?.getAttribute('preserveAspectRatio')).toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 600 160');
    expect(svg?.getAttribute('height')).toBe('160');
  });

  /* Two lines holding the same value put one exactly underneath the other,
     and a reader is left looking at a single line with no way to know the
     second is there. */
  it('dashes the reference so it survives coinciding with the subject', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" />,
    );
    const lines = [...container.querySelectorAll('path[stroke-width="2"]')];
    const dashed = lines.filter((line) => line.getAttribute('stroke-dasharray') !== null);
    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.classList.contains('stroke-status-active')).toBe(true);
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

  /* A readout centred on a point hangs half its own width off whichever end
     the pointer is near, which is where the figures went missing on a narrow
     screen. Pinning it to the opposite edge cannot overflow at any width. */
  it('sends the readout to the side the pointer is not on', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" testId="capital" />,
    );
    const surface = container.querySelector('.relative') as HTMLElement;
    surface.getBoundingClientRect = () => ({ left: 0, width: 600 }) as DOMRect;

    fireEvent.pointerMove(surface, { clientX: 0 });
    expect(screen.getByTestId('capital-tooltip').getAttribute('data-side')).toBe('right');

    fireEvent.pointerMove(surface, { clientX: 600 });
    expect(screen.getByTestId('capital-tooltip').getAttribute('data-side')).toBe('left');
  });

  /* A phone has no room for a gutter beside the plot, so the scale moves
     under it and the line gets the whole width. */
  it('states the scale under the plot as well, for a narrow screen', () => {
    const { container } = render(
      <ValueChart series={[total, cash]} currency="USD" label="Capital" />,
    );
    const narrowOnly = [...container.querySelectorAll('p')].find((node) =>
      node.className.includes('sm:hidden'),
    );
    expect(narrowOnly?.textContent).toContain('to');
    expect(container.querySelector('[aria-hidden="true"].w-16')?.className).toContain('sm:flex');
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
    /* Half of the plot height, which is where a line that never moved
       belongs. */
    expect(container.querySelector('path[stroke-width="2"]')?.getAttribute('d')).toContain('80.0');
  });
});
