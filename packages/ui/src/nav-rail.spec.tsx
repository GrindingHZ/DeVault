import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrowseIcon, WalletIcon } from './icons';
import { NavRail, NavRailItem } from './nav-rail';

describe('NavRail', () => {
  it('names itself for assistive technology', () => {
    render(
      <NavRail>
        <NavRailItem icon={<BrowseIcon />} label="Browse" />
      </NavRail>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
  });

  it('shows the word as well as the picture', () => {
    render(
      <NavRail>
        <NavRailItem icon={<WalletIcon />} label="Wallet" />
      </NavRail>,
    );
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  /* docs/DESIGN-BRIEF.md rule 3: colour is never the only signal, so the
     selected destination is also marked by an edge and by weight. */
  it('marks the current destination by more than a colour', () => {
    const { container } = render(<NavRailItem icon={<BrowseIcon />} label="Browse" isActive />);
    const item = container.querySelector('[data-active="true"]');
    expect(item).toBeTruthy();
    expect(item?.className).toContain('border-l-accent');
    expect(item?.className).toContain('font-semibold');
  });

  it('leaves an unselected destination unmarked', () => {
    const { container } = render(<NavRailItem icon={<BrowseIcon />} label="Browse" />);
    expect(container.querySelector('[data-active="true"]')).toBeNull();
  });

  /* The label already says the name. An icon repeating it would make a
     screen reader announce every destination twice. */
  it('hides the decorative icon from a screen reader', () => {
    const { container } = render(<NavRailItem icon={<BrowseIcon />} label="Browse" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names an icon when it is asked to stand alone', () => {
    render(<BrowseIcon title="Browse" />);
    expect(screen.getByRole('img', { name: 'Browse' })).toBeTruthy();
  });
});
