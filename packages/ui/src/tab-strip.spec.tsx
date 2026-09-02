import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tab, TabItem, TabStrip } from './tab-strip';

describe('TabStrip', () => {
  it('names the group when nothing above it does', () => {
    render(
      <TabStrip label="Which side">
        <Tab label="Borrowing" isActive onSelect={() => {}} />
      </TabStrip>,
    );
    expect(screen.getByRole('group', { name: 'Which side' })).toBeTruthy();
  });

  it('claims no role when an ancestor already names the set', () => {
    render(
      <nav aria-label="Primary">
        <TabStrip>
          <TabItem label="Home" isActive />
        </TabStrip>
      </nav>,
    );
    expect(screen.queryByRole('group')).toBeNull();
  });
});

describe('Tab', () => {
  it('reports which view is chosen', () => {
    render(
      <TabStrip label="Which side">
        <Tab label="Borrowing" isActive onSelect={() => {}} />
        <Tab label="Lending" isActive={false} onSelect={() => {}} />
      </TabStrip>,
    );
    expect(screen.getByRole('button', { name: 'Borrowing' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Lending' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  /* DESIGN-BRIEF rule 3. The admin navigation carried selection in text
     colour alone until P8h, which a reader who cannot separate those two
     greys cannot see at all. Weight and the edge bar are the carriers that
     survive losing the hue, so this asserts both are present and that they
     actually differ between the two states. */
  it('carries selection by weight and an edge bar, not by tone alone', () => {
    render(
      <TabStrip label="Which side">
        <Tab label="Borrowing" isActive onSelect={() => {}} />
        <Tab label="Lending" isActive={false} onSelect={() => {}} />
      </TabStrip>,
    );
    const chosen = screen.getByRole('button', { name: 'Borrowing' }).className;
    const other = screen.getByRole('button', { name: 'Lending' }).className;

    expect(chosen).toContain('font-semibold');
    expect(other).not.toContain('font-semibold');
    expect(chosen).toContain('border-b-accent');
    expect(other).toContain('border-b-transparent');
  });

  it('presses and rings like every other control', () => {
    render(
      <TabStrip label="Which side">
        <Tab label="Borrowing" isActive onSelect={() => {}} />
      </TabStrip>,
    );
    const className = screen.getByRole('button', { name: 'Borrowing' }).className;
    expect(className).toContain('active:scale-press');
    expect(className).toContain('focus-visible:outline-status-active');
  });
});

describe('TabItem', () => {
  /* A destination is a place. The link around this owns `aria-current`, so
     the item must not add a control of its own for a reader to land on. */
  it('is presentation only, for a router link to wrap', () => {
    render(<TabItem label="Reconciliation" isActive />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Reconciliation')).toBeTruthy();
  });

  it('draws the chosen state the same way the button does', () => {
    const { container } = render(<TabItem label="Reconciliation" isActive />);
    expect(container.querySelector('[data-active="true"]')).toBeTruthy();
  });
});
