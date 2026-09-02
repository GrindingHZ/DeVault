import type { ReactElement } from 'react';

export interface LoanToValueProps {
  readonly basisPoints: number;
  /* What this category may be lent against at most. Without it the bands
     below are absolute, which is how a painting at its limit came to read as
     comfortable and a gold bar well inside its limit read as risky. */
  readonly capBasisPoints?: number;
  readonly testId?: string;
}

/* Banded rather than a bare number, because the reader's question is not
   "what is the ratio" but "is this comfortable".

   The bands are a share of what the category allows, not of the appraisal.
   The caps differ by liquidity, from sixty percent against bullion down to
   thirty against art, so the same loan to value means opposite things
   depending on what is in the vault. Judging every category by one absolute
   threshold got four of the five backwards. */
function toneFor(allowanceUsedBasisPoints: number): {
  label: string;
  className: string;
  fill: string;
} {
  if (allowanceUsedBasisPoints <= 6000) {
    return {
      label: 'comfortable for this category',
      className: 'text-status-success',
      fill: 'bg-status-success',
    };
  }
  if (allowanceUsedBasisPoints <= 8500) {
    return {
      label: 'moderate for this category',
      className: 'text-status-warning',
      fill: 'bg-status-warning',
    };
  }
  /* Red at the top of the scale. It is a loan we permit, so this is not a
     refusal; it is the least covered end of what we permit, and a reader
     scanning a rail should be able to see that without reading a number.

     The middle band was the active blue, which on a track running green to
     red read as a fourth unrelated thing rather than as a step along it. */
  return {
    label: 'near the limit for this category',
    className: 'text-status-danger',
    fill: 'bg-status-danger',
  };
}

/* Integer arithmetic all the way to the string. `(2145 / 100).toFixed(1)`
   answers 21.4, because 21.45 is not representable and lands just below it.
   Rounding tenths as integers cannot drift, which matters here for the same
   reason it matters in the ledger. */
function percentOf(basisPoints: number): string {
  const tenths = Math.round(basisPoints / 10);
  const whole = Math.trunc(tenths / 10);
  return tenths % 10 === 0 ? `${whole}` : `${whole}.${tenths % 10}`;
}

/* Integer arithmetic, like every other share in this product. A cap of zero
   would be a parameter set that lends nothing against a category, which is
   not a division anybody should be doing. */
function allowanceUsed(basisPoints: number, capBasisPoints: number): number {
  if (capBasisPoints <= 0) {
    return 10_000;
  }
  return Math.round((basisPoints * 10_000) / capBasisPoints);
}

export function LoanToValue({
  basisPoints,
  capBasisPoints,
  testId,
}: LoanToValueProps): ReactElement {
  /* Integer arithmetic all the way to the string. `(2145 / 100).toFixed(1)`
     answers 21.4, because 21.45 is not representable and lands just below it.
     Rounding tenths as integers cannot drift, which matters here for the same
     reason it matters in the ledger. */
  const tenths = Math.round(basisPoints / 10);
  const whole = Math.trunc(tenths / 10);
  const percent = tenths % 10 === 0 ? `${whole}` : `${whole}.${tenths % 10}`;

  /* Without a cap the chip states the ratio and claims nothing about risk.
     A wrong reassurance is worse than none. */
  if (capBasisPoints === undefined) {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-body text-xs tabular-nums text-ink-secondary"
      >
        {percent}% LTV
      </span>
    );
  }

  const used = allowanceUsed(basisPoints, capBasisPoints);
  const tone = toneFor(used);
  const capTenths = Math.round(capBasisPoints / 10);
  const capPercent =
    capTenths % 10 === 0
      ? `${Math.trunc(capTenths / 10)}`
      : `${Math.trunc(capTenths / 10)}.${capTenths % 10}`;

  return (
    <span
      data-testid={testId}
      title={`${percent}% of the appraisal, against a limit of ${capPercent}% for this category: ${tone.label}.`}
      className={[
        /* Tabular figures in the body face. The digits still line up, which
           is the only reason a chip like this ever wanted a monospace, and
           the two letters beside them stop reading as a typewriter. */
        'inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5',
        'font-body text-xs tabular-nums',
        tone.className,
      ].join(' ')}
    >
      {percent}% LTV
    </span>
  );
}

/* The same banding as a bar rather than a chip.

   A number tells a reader who already knows the cap what the ratio is; a bar
   tells anybody at a glance how much of the category's allowance this loan
   has taken, which is the question they were actually asking. The track is
   the whole allowance and runs from safe through to the limit, so a fill that
   reaches the end is a loan at the most this category permits.

   Colour is never the only carrier: the percentage sits beside it and the
   whole control carries the band in words for anything reading the title. */
export function LoanToValueMeter({
  basisPoints,
  capBasisPoints,
  testId,
}: LoanToValueProps): ReactElement {
  const percent = percentOf(basisPoints);

  if (capBasisPoints === undefined) {
    return (
      <span data-testid={testId} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="h-1.5 min-w-8 flex-1 rounded-full bg-edge" />
        <span className="shrink-0 font-figure text-xs tabular-nums text-ink-secondary">
          {percent}%
        </span>
      </span>
    );
  }

  const used = allowanceUsed(basisPoints, capBasisPoints);
  const tone = toneFor(used);
  const filled = Math.min(100, Math.max(2, used / 100));

  return (
    <span
      data-testid={testId}
      title={`${percent}% of the appraisal, against a limit of ${percentOf(capBasisPoints)}% for this category: ${tone.label}.`}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      {/* The bands are painted into the track at a low opacity so the scale
          itself is legible before anything is filled: a reader can see where
          comfortable stops and the limit begins without a legend. */}
      <span className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-edge">
        <span aria-hidden="true" className="absolute inset-0 flex opacity-40">
          <span className="h-full w-[60%] bg-status-success" />
          <span className="h-full w-[25%] bg-status-warning" />
          <span className="h-full w-[15%] bg-status-danger" />
        </span>
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${tone.fill}`}
          style={{ width: `${String(filled)}%` }}
        />
      </span>
      <span className={`shrink-0 font-figure text-xs font-medium tabular-nums ${tone.className}`}>
        {percent}%
      </span>
    </span>
  );
}
