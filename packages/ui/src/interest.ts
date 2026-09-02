/* The same arithmetic the server does, so a preview and the figure that
   actually gets charged cannot disagree.

   This is a deliberate duplication of `rankOffers` in the domain, and the two
   must stay identical: bigint throughout, truncating division, and a 365 day
   year fixed once in docs/02-domain-model.md. A preview that rounded the
   other way would quote a lender a return they do not get.

   It lives here rather than being imported because packages/ui does not
   depend on the api, and the alternative was a screen that guesses. */
const millisecondsPerYear = 365n * 24n * 60n * 60n * 1000n;

/* Truncating, which rounds in the borrower's favour. Same direction as
   accrual, and documented there for the same reason: somebody would
   otherwise "fix" it. */
export function interestOver(
  principalMinorUnits: string,
  annualPercentageRateBasisPoints: number,
  durationMs: number,
): bigint {
  if (annualPercentageRateBasisPoints <= 0 || durationMs <= 0) {
    return 0n;
  }
  return (
    (BigInt(principalMinorUnits) *
      BigInt(annualPercentageRateBasisPoints) *
      BigInt(Math.trunc(durationMs))) /
    (10_000n * millisecondsPerYear)
  );
}

/* Reads a rate somebody is typing. Accepts "18", "18.5" and "18.50" and
   answers basis points, or null when it is not a rate yet, which is the
   normal state of a field halfway through being filled in. */
export function rateToBasisPoints(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const points = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(points) ? points : null;
}

export interface OfferStanding {
  /* Where this rate would sit, counting from one. */
  readonly position: number;
  readonly total: number;
  readonly isBest: boolean;
}

/* Where a rate would land in the book as it stands. Ties place behind the
   offer already there: somebody who matches the best rate has not beaten it,
   and telling them they had would be the kind of small lie that costs trust
   at exactly the wrong moment. */
export function standingAmong(basisPoints: number, existing: readonly number[]): OfferStanding {
  const better = existing.filter((rate) => rate <= basisPoints).length;
  return {
    position: better + 1,
    total: existing.length + 1,
    isBest: better === 0,
  };
}
