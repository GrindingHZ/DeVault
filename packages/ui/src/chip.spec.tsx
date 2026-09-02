import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';

describe('Chip', () => {
  it('keeps the name reachable when the drawing replaces it', () => {
    render(<Chip label="Sorting and filters" isLabelHidden icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Sorting and filters' })).toBeTruthy();
  });

  it('shows how many constraints are on behind it', () => {
    render(<Chip label="Sorting and filters" isLabelHidden count={2} isActive />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('says nothing when nothing is filtered', () => {
    render(<Chip label="Sorting and filters" isLabelHidden count={0} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  /* A chip that opens a panel is a disclosure, and a disclosure is described
     by whether it is expanded. Saying it is also pressed gives a screen
     reader two answers to one question. */
  it('is expanded rather than pressed when it fronts a panel', () => {
    render(
      <Chip
        label="Sorting and filters"
        isLabelHidden
        aria-haspopup="dialog"
        aria-expanded={false}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Sorting and filters' });
    expect(chip.getAttribute('aria-pressed')).toBeNull();
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('is pressed when it only toggles', () => {
    render(<Chip label="Gold only" isActive />);
    expect(screen.getByRole('button', { name: 'Gold only' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('carries its state by weight as well as by tone', () => {
    render(<Chip label="Gold only" isActive />);
    expect(screen.getByRole('button', { name: 'Gold only' }).className).toContain('font-semibold');
  });
});
