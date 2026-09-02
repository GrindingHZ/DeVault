import { describe, expect, it } from 'vitest';
import type { Position, PositionActionKind } from './position';
import {
  actionsThatRaiseAttention,
  attentionOf,
  attentionOrder,
  needsAttention,
} from './attention';

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    side: 'lending',
    itemDescription: 'Omega Speedmaster',
    listingId: null,
    loanId: null,
    offerId: null,
    stage: 'Standing',
    tone: 'active',
    detail: null,
    figure: null,
    action: null,
    needsAttention: false,
    ...overrides,
  };
}

function raising(kind: PositionActionKind, itemDescription = 'Item'): Position {
  return position({
    itemDescription,
    action: { label: kind, kind },
    needsAttention: true,
  });
}

describe('what needs attention', () => {
  it.each(actionsThatRaiseAttention)('raises a position waiting to %s', (kind) => {
    expect(needsAttention(raising(kind))).toBe(true);
  });
});

/* These matter more than the ones above. A rule like this rots by collecting
   cases, and the moment it collects everything it is the list of everything
   it was written to replace. */
describe('what deliberately does not', () => {
  it('leaves a loan three weeks from maturity alone', () => {
    expect(
      needsAttention(position({ stage: 'Running', action: { label: 'Repay', kind: 'repay' } })),
    ).toBe(false);
  });

  it('leaves a listing quietly taking offers alone', () => {
    expect(
      needsAttention(
        position({ stage: 'Taking offers', action: { label: 'Accept', kind: 'accept' } }),
      ),
    ).toBe(false);
  });

  it('leaves a standing offer alone', () => {
    expect(
      needsAttention(
        position({ stage: 'Standing', action: { label: 'Withdraw', kind: 'withdraw' } }),
      ),
    ).toBe(false);
  });

  it('leaves a settled loan alone', () => {
    expect(needsAttention(position({ stage: 'Settled' }))).toBe(false);
  });

  it('leaves a draft alone', () => {
    expect(
      needsAttention(position({ stage: 'Draft', action: { label: 'Publish', kind: 'publish' } })),
    ).toBe(false);
  });
});

describe('the order to work through them', () => {
  /* Money that can be reclaimed is the only one costing the reader something
     every day they ignore it. */
  it('puts reclaimable money first', () => {
    const ordered = attentionOf([
      raising('collect'),
      raising('claim'),
      raising('reclaim'),
      raising('repay'),
    ]);
    expect(ordered.map((entry) => entry.action?.kind)).toEqual([
      'reclaim',
      'repay',
      'claim',
      'collect',
    ]);
  });

  /* Without this the band reshuffles itself between two renders of data that
     did not change. */
  it('breaks a tie on the item so the band holds still', () => {
    const ordered = attentionOf([raising('repay', 'Zircon'), raising('repay', 'Amber')]);
    expect(ordered.map((entry) => entry.itemDescription)).toEqual(['Amber', 'Zircon']);
  });

  it('sorts a position with no action last rather than crashing', () => {
    const withoutAction = position({ needsAttention: true, itemDescription: 'Orphan' });
    const ordered = attentionOf([withoutAction, raising('reclaim')]);
    expect(ordered[1]?.itemDescription).toBe('Orphan');
  });

  it('is a stable comparator', () => {
    const left = raising('repay', 'Same');
    const right = raising('repay', 'Same');
    expect(attentionOrder(left, right)).toBe(0);
  });
});

describe('the band as a whole', () => {
  it('is empty when nothing needs doing, which is most days', () => {
    expect(attentionOf([position(), position({ stage: 'Earning' })])).toEqual([]);
  });

  it('leaves the caller list alone', () => {
    const input = [raising('collect'), raising('reclaim')];
    attentionOf(input);
    expect(input[0]?.action?.kind).toBe('collect');
  });
});
