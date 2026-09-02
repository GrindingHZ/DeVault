import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionRow } from './position-row';

function row(overrides: Partial<Parameters<typeof PositionRow>[0]> = {}) {
  return (
    <PositionRow
      itemDescription="Omega Speedmaster"
      side="borrowing"
      stage="Running"
      tone="active"
      figure={{ label: 'Owed today', value: 'AUD 4,059.17' }}
      actionLabel="Repay"
      {...overrides}
    />
  );
}

describe('PositionRow', () => {
  it('leads with the item rather than an identifier', () => {
    render(row());
    expect(screen.getByText('Omega Speedmaster')).toBeTruthy();
  });

  it('states the stage in words', () => {
    render(row());
    expect(screen.getByText('Running')).toBeTruthy();
  });

  it('says which side the reader is on', () => {
    render(row({ side: 'lending' }));
    expect(screen.getByText('You lent')).toBeTruthy();
  });

  it('shows no action when there is nothing to do', () => {
    render(row({ actionLabel: null }));
    expect(screen.queryByRole('button', { name: 'Repay' })).toBeNull();
  });

  /* A reclaim moves money. It must not also navigate, or a reader who wanted
     to look at the position ends up having done something to it. */
  it('acts without also opening', () => {
    const onAct = vi.fn();
    const onOpen = vi.fn();
    render(row({ onAct, onOpen }));
    fireEvent.click(screen.getByRole('button', { name: 'Repay' }));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens when the row itself is used', () => {
    const onOpen = vi.fn();
    render(row({ onOpen }));
    fireEvent.click(screen.getByText('Omega Speedmaster'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('marks an attention row by more than its colour', () => {
    const { container } = render(row({ needsAttention: true }));
    expect(container.querySelector('[data-attention="true"]')).toBeTruthy();
  });

  it('renders a row with no figure at all', () => {
    render(row({ figure: null }));
    expect(screen.getByText('Omega Speedmaster')).toBeTruthy();
  });
});
