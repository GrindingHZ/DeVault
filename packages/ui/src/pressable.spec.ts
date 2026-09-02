import { describe, expect, it } from 'vitest';
import { focusRing, focusRingInset, pressable, pressableInset } from './pressable';

describe('pressable', () => {
  it('spends amplitude tokens rather than raw transforms', () => {
    expect(pressable).toContain('active:scale-press');
    expect(pressable).toContain('hover:translate-y-lift');
  });

  /* The whole tiering rests on this. A hardcoded duration or curve here
     would press identically on a marketplace floor and on a vault terminal,
     and would keep pressing for a reader who asked their system for less
     motion. */
  it('spends duration and easing tokens too', () => {
    expect(pressable).toContain('duration-enter');
    expect(pressable).toContain('ease-spring');
    expect(pressable).toContain('active:duration-control');
  });

  it('names the properties it animates, so nothing else slides', () => {
    expect(pressable).toContain(
      'transition-[color,background-color,border-color,box-shadow,transform]',
    );
    expect(pressable).not.toContain('transition-all');
  });

  it('takes the gesture back off a control that cannot be used', () => {
    expect(pressable).toContain('disabled:hover:translate-y-0');
    expect(pressable).toContain('disabled:active:scale-100');
  });

  it('carries a focus ring, so no caller has to remember one', () => {
    expect(pressable).toContain(focusRing);
  });

  /* Both rings in one class list would leave the winner to stylesheet order
     rather than to the caller, which is the bug that split these apart. */
  it('offers the inset ring as an alternative rather than an addition', () => {
    expect(pressableInset).toContain(focusRingInset);
    expect(pressableInset).not.toContain('focus-visible:outline-offset-2');
    expect(pressable).not.toContain('focus-visible:-outline-offset-2');
  });
});
