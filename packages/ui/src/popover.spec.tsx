import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Popover } from './popover';

function open(surface?: string) {
  const result = render(
    <div data-surface={surface} style={{ overflow: 'hidden' }}>
      <Popover label="Open the menu" testId="menu" trigger="M" triggerClassName="x">
        <p>Panel content</p>
      </Popover>
    </div>,
  );
  fireEvent.click(screen.getByTestId('menu'));
  return result;
}

describe('Popover', () => {
  it('stays shut until it is asked for', () => {
    render(
      <Popover label="Open the menu" testId="menu" trigger="M" triggerClassName="x">
        <p>Panel content</p>
      </Popover>,
    );
    expect(screen.queryByText('Panel content')).toBeNull();
  });

  it('reports whether it is open', () => {
    open();
    expect(screen.getByTestId('menu').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Panel content')).toBeTruthy();
  });

  /* Triggers live in a header row and a table header, both of which clip
     anything positioned inside them. */
  it('renders outside the element it is triggered from', () => {
    const { container } = open();
    const panel = screen.getByTestId('menu-panel');
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  /* Leaving for the body also left the palette scope, so every panel on the
     marketplace floor opened white on a dark screen. */
  it('carries the palette scope of whatever it was triggered from', () => {
    open('floor');
    expect(screen.getByTestId('menu-panel').getAttribute('data-surface')).toBe('floor');
  });

  it('claims no scope when it was not triggered from one', () => {
    open();
    expect(screen.getByTestId('menu-panel').getAttribute('data-surface')).toBeNull();
  });

  it('closes on escape and does not strand the focus', () => {
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Panel content')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('menu'));
  });

  /* A menu item that changes something must not leave the panel sitting
     over the change it just made. */
  it('closes when something inside it is used', () => {
    open();
    fireEvent.click(screen.getByText('Panel content'));
    expect(screen.queryByText('Panel content')).toBeNull();
  });
});
