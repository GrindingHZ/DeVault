import { describe, expect, it } from 'vitest';
import { rateStepBasisPoints, snapToRateStep } from './rate-step';

describe('snapToRateStep', () => {
  it('steps by half a percent', () => {
    expect(rateStepBasisPoints).toBe(50);
  });

  /* The box takes any rate; the slider shows the notch nearest to it, so the
     thumb and the painted fill land on the same place the browser does. */
  it('lands a typed rate on the nearest notch', () => {
    expect(snapToRateStep(1825, 2400)).toBe(1850);
    expect(snapToRateStep(1824, 2400)).toBe(1800);
    expect(snapToRateStep(1800, 2400)).toBe(1800);
  });

  it('never goes below the first notch', () => {
    expect(snapToRateStep(1, 2400)).toBe(50);
    expect(snapToRateStep(0, 2400)).toBe(50);
  });

  /* A ceiling off the grid is still the end of the scale, but the slider can
     only reach the last notch under it. */
  it('stops at the last notch the scale can reach', () => {
    expect(snapToRateStep(2430, 2430)).toBe(2400);
    expect(snapToRateStep(9999, 2400)).toBe(2400);
  });
});
