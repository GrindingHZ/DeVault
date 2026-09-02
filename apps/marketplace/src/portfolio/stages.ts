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
  readonly meaning: string;
}

const borrowingStages = {
  Draft: {
    tone: 'neutral',
    meaning: 'Written but not published. No lender can see it yet.',
  },
  'Taking offers': {
    tone: 'active',
    meaning: 'Live on the market. Lenders are competing by lowering the rate they will accept.',
  },
  Cancelled: {
    tone: 'neutral',
    meaning: 'You took the listing down. Any holds against it were released.',
  },
  Expired: {
    tone: 'neutral',
    meaning: 'The listing ran out of time before anyone funded it.',
  },
  Running: {
    tone: 'active',
    meaning: 'Live and inside its term. Interest is building each day you hold it.',
  },
  'In grace': {
    tone: 'warning',
    meaning:
      'Past the maturity date but still inside the grace period. Interest stopped at maturity, so what you owe is now fixed. Repay before grace ends or the item can be taken.',
  },
  Repaid: {
    tone: 'success',
    meaning: 'Settled in full. The item is back under your name and waiting in the vault.',
  },
  Defaulted: {
    tone: 'danger',
    meaning:
      'Grace ran out without a repayment. The lender holds the receipt and the item goes to sale.',
  },
  Sold: {
    tone: 'danger',
    meaning: 'The item was sold to cover the loan. It is no longer yours to redeem.',
  },
} as const satisfies Record<string, StageMeaning>;

const lendingStages = {
  Standing: {
    tone: 'active',
    meaning: 'Your offer is live and your money is held against it. Nobody has undercut you.',
  },
  Outbid: {
    tone: 'warning',
    meaning:
      'Somebody offered a lower rate. Your money is still held and earning nothing until you reclaim it.',
  },
  Expired: {
    tone: 'warning',
    meaning: 'Your offer ran out of time. The hold is still yours to reclaim.',
  },
  Withdrawn: {
    tone: 'neutral',
    meaning: 'You pulled the offer before it was taken. The hold went back to your balance.',
  },
  Earning: {
    tone: 'active',
    meaning: 'The loan is live and inside its term. Interest is accruing to you each day.',
  },
  'Past grace': {
    tone: 'warning',
    meaning:
      'The borrower did not repay and grace has run out. Nothing happens on its own: mark it defaulted to take the collateral.',
  },
  Settled: {
    tone: 'success',
    meaning: 'The borrower repaid in full. Your principal and interest are back in your balance.',
  },
  Defaulted: {
    tone: 'danger',
    meaning: 'You hold the receipt. Claim the collateral and the item goes to sale on your behalf.',
  },
  Sold: {
    tone: 'neutral',
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
