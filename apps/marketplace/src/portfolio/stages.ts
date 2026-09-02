import type { StatusTone } from '@depawn/ui';
import type { PositionSide } from './position';

/* Every word the portfolio will ever put in its status column, defined once.

   The legend behind the column header renders this table, and the mappers
   take their stage from it. Two lists would have drifted the first time
   somebody added a state, and a legend that is missing a status is worse
   than no legend: it tells the reader they have seen all of them.

   Split by side rather than shared, because the same event reads differently
   from the two ends of it. A default is a disaster to a borrower and an
   opportunity to a lender. An item being sold costs the borrower the item and
   pays the lender out. One row with one tone and one sentence would have had
   to pick a side and be wrong for the other. */

export interface StageMeaning {
  readonly tone: StatusTone;
  /* Whether the story is over. A terminal position drops out of what the
     reader is watching and into the history behind it, whatever controls the
     row still carries: a loan that has been paid off in full is finished
     even though its item is still on a shelf. A stage with more of the story
     left in it says so here instead. */
  readonly isTerminal: boolean;
  readonly meaning: string;
}

const borrowingStages = {
  Draft: {
    tone: 'neutral',
    isTerminal: false,
    meaning: 'Written but not published. No lender can see it yet.',
  },
  'Taking offers': {
    tone: 'active',
    isTerminal: false,
    meaning: 'Live on the market. Lenders are competing by lowering the rate they will accept.',
  },
  Cancelled: {
    tone: 'neutral',
    isTerminal: true,
    meaning: 'You took the listing down. Any holds against it were released.',
  },
  Expired: {
    tone: 'neutral',
    isTerminal: true,
    meaning: 'The listing ran out of time before anyone funded it.',
  },
  Running: {
    tone: 'active',
    isTerminal: false,
    meaning: 'Live and inside its term. Interest is building each day you hold it.',
  },
  'In grace': {
    tone: 'warning',
    isTerminal: false,
    meaning:
      'Past the maturity date but still inside the grace period. Interest stopped at maturity, so what you owe is now fixed. Repay before grace ends or the item can be taken.',
  },
  Repaid: {
    tone: 'success',
    isTerminal: true,
    meaning:
      'Settled in full. The item is back under your name and waiting in the vault for you to ask for it.',
  },
  'Collection requested': {
    tone: 'active',
    isTerminal: true,
    meaning:
      'You have asked for the item back and the vault is expecting you. Bring photo identification to the counter; staff verify you, break the seal in front of you and hand it over.',
  },
  Collected: {
    tone: 'success',
    isTerminal: true,
    meaning:
      'The seal was broken in front of you and the item left the vault. The receipt is spent.',
  },
  Defaulted: {
    tone: 'danger',
    isTerminal: true,
    meaning:
      'Grace ran out without a repayment. The lender holds the receipt and the item goes to sale.',
  },
  Sold: {
    tone: 'danger',
    isTerminal: true,
    meaning: 'The item was sold to cover the loan. It is no longer yours to redeem.',
  },
} as const satisfies Record<string, StageMeaning>;

const lendingStages = {
  Standing: {
    tone: 'active',
    isTerminal: false,
    meaning: 'Your offer is live and your money is held against it. Nobody has undercut you.',
  },
  Outbid: {
    tone: 'warning',
    isTerminal: false,
    meaning:
      'Somebody offered a lower rate. Your money is still held and earning nothing until you reclaim it.',
  },
  Expired: {
    tone: 'warning',
    isTerminal: false,
    meaning: 'Your offer ran out of time. The hold is still yours to reclaim.',
  },
  Withdrawn: {
    tone: 'neutral',
    isTerminal: true,
    meaning: 'You pulled the offer before it was taken. The hold went back to your balance.',
  },
  Earning: {
    tone: 'active',
    isTerminal: false,
    meaning: 'The loan is live and inside its term. Interest is accruing to you each day.',
  },
  'Listed for sale': {
    tone: 'active',
    isTerminal: false,
    meaning:
      'Your position is on the secondary market at your ask. The first buyer takes it and the money lands in your balance; withdraw the sale to keep the position.',
  },
  'Past grace': {
    tone: 'warning',
    isTerminal: false,
    meaning:
      'The borrower did not repay and grace has run out. Nothing happens on its own: mark it defaulted to take the collateral.',
  },
  Settled: {
    tone: 'success',
    isTerminal: true,
    meaning: 'The borrower repaid in full. Your principal and interest are back in your balance.',
  },
  Defaulted: {
    tone: 'danger',
    /* Not finished: the collateral is still sitting there waiting to be
       taken, and until somebody takes it this position is one of the few
       that is actually costing its holder to ignore. It becomes Claimed,
       which is finished. */
    isTerminal: false,
    meaning:
      'The borrower did not repay and grace has run out. Claim the collateral to take the receipt into your own name.',
  },
  Claimed: {
    tone: 'success',
    isTerminal: true,
    meaning:
      'The receipt is in your name and the item is in the vault under it. It appears in My items, where you can collect it or leave it to be sold.',
  },
  Sold: {
    tone: 'neutral',
    isTerminal: true,
    meaning: 'The collateral was sold and you were paid from the proceeds.',
  },
} as const satisfies Record<string, StageMeaning>;

export type BorrowingStage = keyof typeof borrowingStages;
export type LendingStage = keyof typeof lendingStages;
export type StageName = BorrowingStage | LendingStage;

const bySide = {
  borrowing: borrowingStages,
  lending: lendingStages,
} as const;

export function toneOf(stage: StageName, side: PositionSide): StatusTone {
  const table: Record<string, StageMeaning> = bySide[side];
  /* The union is wider than either side's table. A stage read from the wrong
     side is a mapping error rather than a display one, so it is left plain
     instead of being given a colour it has not earned. */
  return table[stage]?.tone ?? 'neutral';
}

export function stagesFor(side: PositionSide): readonly (StageMeaning & { label: string })[] {
  const table: Record<string, StageMeaning> = bySide[side];
  return Object.entries(table).map(([label, meaning]) => ({ label, ...meaning }));
}

export function meaningOf(stage: StageName, side: PositionSide): string | null {
  const table: Record<string, StageMeaning> = bySide[side];
  return table[stage]?.meaning ?? null;
}

export function isTerminal(stage: StageName, side: PositionSide): boolean {
  const table: Record<string, StageMeaning> = bySide[side];
  return table[stage]?.isTerminal ?? false;
}
