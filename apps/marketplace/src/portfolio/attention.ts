import type { Position, PositionActionKind } from './position';

/* Stated once, here, so it cannot drift into meaning "anything interesting".

   A position needs attention when there is something its holder would regret
   not doing today. That is four cases and no others:

     money stuck in a hold that lost and will sit there until it is asked for
     a loan at or past its maturity
     a defaulted loan whose collateral can still be claimed
     an item repaid for and waiting in a vault to be walked out of

   A loan three weeks from maturity is not attention. Neither is a listing
   quietly taking offers, nor an offer standing inside its minimum lifetime.
   The whole value of this band is that it is empty most days, and a band
   that collects everything is the list of everything it replaced. */

const urgentActions: readonly PositionActionKind[] = ['reclaim', 'repay', 'collect', 'claim'];

export function needsAttention(position: Position): boolean {
  return position.needsAttention;
}

/* The order to work through them in. Money the reader can get back comes
   first, because it is the only one costing them something every day it is
   ignored. Then the deadlines, then the collections, which wait patiently.

   Ties fall back to the item so the band does not reshuffle itself between
   two renders of the same data. */
const rank: Record<PositionActionKind, number> = {
  reclaim: 0,
  repay: 1,
  claim: 2,
  collect: 3,
  publish: 4,
  accept: 5,
  withdraw: 6,
};

export function attentionOrder(left: Position, right: Position): number {
  const leftRank = left.action === null ? Number.MAX_SAFE_INTEGER : rank[left.action.kind];
  const rightRank = right.action === null ? Number.MAX_SAFE_INTEGER : rank[right.action.kind];
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.itemDescription.localeCompare(right.itemDescription);
}

export function attentionOf(positions: readonly Position[]): readonly Position[] {
  return [...positions].filter(needsAttention).sort(attentionOrder);
}

/* Exported for the test that proves the two lists cannot drift apart: every
   kind the rule raises must be one a person can actually act on. */
export const actionsThatRaiseAttention = urgentActions;
