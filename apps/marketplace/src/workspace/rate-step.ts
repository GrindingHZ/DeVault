/* The slider moves in half percent notches. Undercutting by a hundredth of a
   percent is not a number anybody aims at with a mouse, and a track of two
   thousand stops is one where every drag lands somewhere nobody chose. The
   box beside the slider still takes any rate the contract accepts, so a
   lender who wants 18.25 types it. */
export const rateStepBasisPoints = 50;

/* Where the thumb sits for a rate that may not be on a notch: the nearest one,
   never below the first, never past the last the scale can reach. The browser
   snaps a range input the same way, so painting the fill from this figure
   keeps it under the thumb rather than a few pixels off. */
export function snapToRateStep(basisPoints: number, ceilingBasisPoints: number): number {
  const lastNotch = Math.max(
    Math.floor(ceilingBasisPoints / rateStepBasisPoints) * rateStepBasisPoints,
    rateStepBasisPoints,
  );
  const nearest = Math.round(basisPoints / rateStepBasisPoints) * rateStepBasisPoints;
  return Math.min(Math.max(nearest, rateStepBasisPoints), lastNotch);
}
