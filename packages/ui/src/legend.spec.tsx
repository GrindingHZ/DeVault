import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Legend } from './legend';

const entries = [
  { label: 'Running', tone: 'active' as const, meaning: 'Live and inside its term.' },
  { label: 'In grace', tone: 'warning' as const, meaning: 'Past maturity, repay before it ends.' },
];

function open() {
  render(<Legend noun="status" entries={entries} testId="status-legend" />);
  fireEvent.click(screen.getByTestId('status-legend'));
}

describe('Legend', () => {
  it('stays shut until it is asked for', () => {
    render(<Legend noun="status" entries={entries} testId="status-legend" />);
    expect(screen.queryByText('Live and inside its term.')).toBeNull();
  });

  it('lists every status and what it means', () => {
    open();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Live and inside its term.')).toBeTruthy();
    expect(screen.getByText('Past maturity, repay before it ends.')).toBeTruthy();
  });

  /* Opens on click rather than hover: hover has no touch equivalent and no
     keyboard equivalent, so a hover panel is a feature only some people get. */
  it('reports whether it is open', () => {
    render(<Legend noun="status" entries={entries} testId="status-legend" />);
    const trigger = screen.getByTestId('status-legend');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  /* Its natural home is a table header, and a wide table scrolls inside an
     overflow container that would clip it. The panel leaves the table
     rather than being trapped by it. */
  it('renders outside the element it is triggered from', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <Legend noun="status" entries={entries} testId="status-legend" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('status-legend'));
    const panel = screen.getByTestId('status-legend-panel');
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('closes on escape and does not strand the focus', () => {
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Live and inside its term.')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('status-legend'));
  });

  /* The trigger takes a noun and builds the sentence, rather than taking a
     sentence and wrapping it in another one. */
  it('names itself for a screen reader', () => {
    render(<Legend noun="status" entries={entries} testId="status-legend" />);
    expect(screen.getByTestId('status-legend').getAttribute('aria-label')).toBe(
      'What each status means',
    );
  });
});
