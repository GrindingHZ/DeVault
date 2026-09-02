import type { ReactElement } from 'react';
import type { BookStanding, MarketRole, MarketTone } from './market-delta';
import { formatRate } from './rate';

export interface BestRateProps {
  readonly basisPoints: number;
  readonly role: MarketRole;
  /* Where the reader sits in the book. Read from the book in the order the
     book ranks it, so this and the table beneath cannot disagree. */
  readonly viewerStanding: BookStanding;
  /* Whether anybody else has offered. One offer is not a market yet, and
     saying it leads says nothing. */
  readonly hasCompetition: boolean;
}

/* The cheapest rate standing against a listing, and what it means to whoever
   is reading it.

   This was a `MarketDelta` fed the best rate against the second best. That is
   a spread across the book at one moment, not a movement over time, and the
   component reads its input as a movement. The rates are sorted, so the best
   is never above the one behind it: the direction came out "down" on every
   listing with two offers and "flat" on every other, which made the arrow
   permanently red for a lender and permanently green for a borrower. It was
   not reporting anything. It could not have reported anything.

   What is actually good or bad news here is where the reader stands, so that
   is what the colour tracks. A lender whose offer leads is winning; one who
   has been undercut is losing; one who has not offered is being told about
   the book rather than about themselves. */

const toneClasses: Record<MarketTone, string> = {
  favourable: 'text-market-favourable',
  adverse: 'text-market-adverse',
  flat: 'text-market-flat',
};

const lenderReadings: Record<BookStanding, string> = {
  leads: 'yours is the cheapest offer',
  behind: 'you have been undercut',
  absent: 'nobody has your money in this yet',
};

const lenderTones: Record<BookStanding, MarketTone> = {
  leads: 'favourable',
  behind: 'adverse',
  absent: 'flat',
};

export function BestRate({
  basisPoints,
  role,
  viewerStanding,
  hasCompetition,
}: BestRateProps): ReactElement {
  /* A borrower reads their own listing, where every offer is money offered to
     them and a lower one is cheaper. Competition is the whole mechanism
     working, so it is favourable; a single offer is a fact rather than news.

     The reader's own standing does not apply: a borrower cannot bid on their
     own item. */
  const tone: MarketTone =
    role === 'borrower' ? (hasCompetition ? 'favourable' : 'flat') : lenderTones[viewerStanding];

  const reading =
    role === 'borrower'
      ? hasCompetition
        ? 'lenders are undercutting each other for this'
        : 'the first offer, with nothing against it yet'
      : lenderReadings[viewerStanding];

  return (
    <div data-tone={tone} className="flex flex-col gap-0.5">
      <span className="font-body text-xs text-ink-secondary">best rate offered</span>
      <span className={`font-figure text-lg font-semibold tabular-nums ${toneClasses[tone]}`}>
        {formatRate(basisPoints)}
      </span>
      {/* Colour is never the only signal (docs/DESIGN-BRIEF.md rule 3). */}
      <span className="font-body text-xs text-ink-secondary">{reading}</span>
    </div>
  );
}
