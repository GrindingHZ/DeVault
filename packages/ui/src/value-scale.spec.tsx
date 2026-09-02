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

  /* Two amounts a few percent apart would print over each other, so they are
     written as one label instead of two overlapping ones. */
  it('joins annotations that would be written on top of each other', () => {
    const { container } = render(
      <ValueScale
        marks={marks.map((mark) =>
          mark.emphasis === 'muted' ? { ...mark, annotate: true, caption: mark.label } : mark,
        )}
        currency="USD"
        label="What this costs"
        testId="scale"
      />,
    );
    const written = container.querySelector('[data-testid="scale-value-lent"]') as HTMLElement;
    expect(written.textContent).toContain('2,500.00');
    expect(written.textContent).toContain('2,512.32');
    expect(container.querySelector('[data-testid="scale-value-today"]')).toBeNull();
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
