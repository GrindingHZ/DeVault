import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValueScale } from './value-scale';

const marks = [
  { id: 'ask', minorUnits: 240000n, label: 'You pay', emphasis: 'primary' as const },
  { id: 'lent', minorUnits: 250000n, label: 'Originally lent', emphasis: 'muted' as const },
  { id: 'today', minorUnits: 251232n, label: 'Worth today', emphasis: 'muted' as const },
  { id: 'maturity', minorUnits: 253698n, label: 'You receive', emphasis: 'primary' as const },
];

function leftOf(node: Element | null): number {
  return Number((node as HTMLElement | null)?.style.left.replace('%', '') ?? -1);
}

describe('ValueScale', () => {
  it('places every mark at the distance its amount actually sits', () => {
    const { container } = render(
      <ValueScale marks={marks} currency="USD" label="What this costs" testId="scale" />,
    );
    // The lowest opens the line and the highest closes it.
    expect(leftOf(container.querySelector('[data-testid="scale-mark-ask"]'))).toBe(0);
    expect(leftOf(container.querySelector('[data-testid="scale-mark-maturity"]'))).toBe(100);
    // 250000 of the way from 240000 to 253698 is a bit over seven tenths.
    const lent = leftOf(container.querySelector('[data-testid="scale-mark-lent"]'));
    expect(lent).toBeGreaterThan(70);
    expect(lent).toBeLessThan(75);
    expect(leftOf(container.querySelector('[data-testid="scale-mark-today"]'))).toBeGreaterThan(
      lent,
    );
  });

  /* The whole point of the line: the distance between two figures is the
     figure a reader would otherwise have to work out. */
  it('lights the stretch between two marks and says what it is worth', () => {
    const { container } = render(
      <ValueScale
        marks={marks}
        segments={[
          { fromId: 'ask', toId: 'today', label: 'Yours at once', tone: 'favourable' },
          { fromId: 'today', toId: 'maturity', label: 'Still to earn', tone: 'neutral' },
        ]}
        currency="USD"
        label="What this costs"
        testId="scale"
      />,
    );
    const atOnce = container.querySelector('[data-testid="scale-segment-ask"]') as HTMLElement;
    expect(atOnce.style.left).toBe('0%');
    expect(Number(atOnce.style.width.replace('%', ''))).toBeGreaterThan(80);
    expect(screen.getByText('Yours at once')).toBeTruthy();
    expect(screen.getByText('Still to earn')).toBeTruthy();
  });

  /* Two marks that can hold the same value go on opposite sides, which is
     the one arrangement that cannot collide however close they land. */
  it('writes each annotation on the side it asks for', () => {
    const { container } = render(
      <ValueScale
        marks={[
          marks[0] as (typeof marks)[number],
          { ...(marks[1] as (typeof marks)[number]), annotate: 'below', caption: 'Principal' },
          { ...(marks[2] as (typeof marks)[number]), annotate: 'above', caption: 'Today' },
          marks[3] as (typeof marks)[number],
        ]}
        currency="USD"
        label="What this costs"
        testId="scale"
      />,
    );
    const principal = container.querySelector('[data-testid="scale-value-lent"]') as HTMLElement;
    const today = container.querySelector('[data-testid="scale-value-today"]') as HTMLElement;
    expect(principal.textContent).toContain('Principal');
    expect(principal.textContent).toContain('2,500.00');
    expect(today.textContent).toContain('Today');
    expect(today.textContent).toContain('2,512.32');
    // Below the line is a larger offset from the top than above it.
    expect(Number(principal.style.top.replace('px', ''))).toBeGreaterThan(
      Number(today.style.top.replace('px', '')),
    );
  });

  it('leaves an unannotated mark as a dot alone', () => {
    const { container } = render(
      <ValueScale marks={marks} currency="USD" label="What this costs" testId="scale" />,
    );
    expect(container.querySelector('[data-testid="scale-value-lent"]')).toBeNull();
  });

  it('names every figure for a reader who cannot see the line', () => {
    render(<ValueScale marks={marks} currency="USD" label="What this costs" testId="scale" />);
    const described = screen.getByRole('img');
    expect(described.getAttribute('aria-label')).toContain('You pay 2,400.00');
    expect(described.getAttribute('aria-label')).toContain('You receive 2,536.98');
  });

  /* Four identical figures have no distances to draw, and stacking them at
     one end would read as three of them missing. */
  it('puts marks that do not differ through the middle', () => {
    const flat = marks.map((mark) => ({ ...mark, minorUnits: 100n }));
    const { container } = render(
      <ValueScale marks={flat} currency="USD" label="Flat" testId="scale" />,
    );
    expect(leftOf(container.querySelector('[data-testid="scale-mark-ask"]'))).toBe(50);
    expect(leftOf(container.querySelector('[data-testid="scale-mark-maturity"]'))).toBe(50);
  });
});
