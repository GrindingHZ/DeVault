/* The lending ceiling per item category, restored from the web2 protocol
   parameters (docs/OPEN-QUESTIONS.md Q-003). A category is priced by how fast
   and how certainly a liquidator turns the thing back into money: bullion is
   spot priced and sells the same day, so we lend against most of it; a painting
   is an opinion, so we lend against much less. The ceiling on a listing is the
   appraised value scaled by its category's basis points, and it caps every
   offer. Phase 3 will mirror this as a shared Config behind an AdminCap; until
   then it is the single source both the market read and the offer build use. */

export const MAX_LOAN_TO_VALUE_BASIS_POINTS_BY_CATEGORY: Readonly<Record<string, number>> = {
  BULLION: 6000,
  WATCH: 5000,
  JEWELLERY: 4500,
  COLLECTIBLE: 3500,
  ART: 3000,
};

/* The most conservative ceiling, used for a category the table has not been
   taught yet: refusing to lend generously against an unknown is the only safe
   reading of a parameter set that has fallen behind. */
export const DEFAULT_MAX_LOAN_TO_VALUE_BASIS_POINTS = 3000;

/* The highest annual rate a borrower may ask, shared by every listing. */
export const MAX_ANNUAL_PERCENTAGE_RATE_BASIS_POINTS = 4800;

export function loanToValueBasisPointsFor(category: string): number {
  return (
    MAX_LOAN_TO_VALUE_BASIS_POINTS_BY_CATEGORY[category] ?? DEFAULT_MAX_LOAN_TO_VALUE_BASIS_POINTS
  );
}

/* The most a lender may lend against an item: its appraised value scaled by the
   category's basis points, in the settlement coin's base units. */
export function maxLendBaseUnits(appraisedValueBaseUnits: bigint, category: string): bigint {
  return (appraisedValueBaseUnits * BigInt(loanToValueBasisPointsFor(category))) / 10_000n;
}
