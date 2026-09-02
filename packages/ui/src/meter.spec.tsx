import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from './meter';

describe('Meter', () => {
  it('reports its reading in words rather than as a bare percentage', () => {
    render(
      <Meter
        filledBasisPoints={3667}
        tone="active"
        label="Term elapsed"
        valueText="day 23 of 60"
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Term elapsed' });
    expect(bar.getAttribute('aria-valuenow')).toBe('37');
    expect(bar.getAttribute('aria-valuetext')).toBe('day 23 of 60');
  });

  /* Callers clamp too, but a bar that trusted its input would paint outside
     its own track and there is no reason to have that failure twice. */
  it('never paints past full', () => {
    const { container } = render(
      <Meter filledBasisPoints={99_999} tone="danger" label="Term elapsed" valueText="over" />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('100%');
  });

  it('never paints a negative width', () => {
    const { container } = render(
      <Meter
        filledBasisPoints={-500}
        tone="neutral"
        label="Term elapsed"
        valueText="not started"
      />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('0%');
  });
});
