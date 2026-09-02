import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './slider';

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

describe('Slider', () => {
  it('is a real range input, so the keyboard and the platform both reach it', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Annual rate' });
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.getAttribute('min')).toBe('1');
    expect(slider.getAttribute('max')).toBe('2400');
  });

  /* Storage is basis points. A screen reader announcing "one thousand eight
     hundred" for a rate of 18% is reading the wire format aloud. */
  it('announces the figure the way a reader would say it', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
      />,
    );
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('18.00%');
  });

  it('reports the number rather than the string the input carries', () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={onValueChange}
        valueText={percent}
      />,
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1550' } });
    expect(onValueChange).toHaveBeenCalledWith(1550);
  });

  it('states both ends of the scale', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
      />,
    );
    expect(screen.getByText('0.01%')).toBeTruthy();
    expect(screen.getByText('24.00%')).toBeTruthy();
  });

  /* The mark replaced a button that did the subtraction for the lender. It
     has to name what it is, or it is a line on a track. */
  it('names the reference point it draws on the track', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
        marker={{ value: 1600, label: 'Best' }}
      />,
    );
    expect(screen.getByText('Best')).toBeTruthy();
    expect(screen.getByText('16.00%')).toBeTruthy();
  });

  it('draws no mark when there is nothing to aim at', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
      />,
    );
    expect(screen.queryByText('Best')).toBeNull();
  });

  it('carries the box that shows the same figure', () => {
    render(
      <Slider
        label="Annual rate"
        value={1800}
        min={1}
        max={2400}
        onValueChange={() => {}}
        valueText={percent}
        valueControl={<input aria-label="Annual rate typed" defaultValue="18.00" />}
      />,
    );
    expect(screen.getByLabelText('Annual rate typed')).toBeTruthy();
  });
});
