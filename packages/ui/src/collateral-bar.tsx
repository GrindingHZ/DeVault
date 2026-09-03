import type { CSSProperties, ReactElement } from 'react';
import { CurrencyMark } from './currency-mark';
import { formatAmount, formatMoney } from './money';
import type { MoneyValue } from './money';
import { formatPercentage } from './percentage';

export interface CollateralBarProps {
  readonly appraisedValue: MoneyValue;
  readonly requestedPrincipal: MoneyValue;
  /* The most this category may be lent against, from the loan to value cap
     in the protocol parameters. */
  readonly maxPrincipal: MoneyValue;
  readonly loanToValueBasisPoints: number;
}

/* Integer arithmetic to a share of ten thousand, then one division for a
   width. Same rule as everywhere else: the figures a person reads never pass
   through a float. */
function shareOf(part: MoneyValue, whole: MoneyValue): number {
  const total = BigInt(whole.minorUnits);
  if (total <= 0n) {
    return 0;
  }
  const basisPoints = (BigInt(part.minorUnits) * 10_000n) / total;
  return Math.min(Number(basisPoints) / 100, 100);
}

/* What the item is worth, what is being borrowed against it, and where the
   ceiling sits, drawn against each other.

   These three numbers were four separate figures in a definition list, which
   left every reader doing the same division in their head. A lender's actual
   question is how much room is left before the security stops covering the
   loan, and that is a length, not a number. */
export function CollateralBar({
  appraisedValue,
  requestedPrincipal,
  maxPrincipal,
  loanToValueBasisPoints,
}: CollateralBarProps): ReactElement {
  const borrowedShare = shareOf(requestedPrincipal, appraisedValue);
  const ceilingShare = shareOf(maxPrincipal, appraisedValue);
  /* Recovered from the two amounts rather than passed separately, because the
     server has already applied the category's cap to produce maxPrincipal and
     a second copy of the same policy could disagree with it. */
  const categoryCapBasisPoints = Math.round(ceilingShare * 100);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="font-body text-xs text-ink-secondary">Borrowed against the appraisal</span>
        <span className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
          {formatPercentage(loanToValueBasisPoints)}
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={`${formatMoney(requestedPrincipal)} borrowed against an appraisal of ${formatMoney(
          appraisedValue,
        )}. The ceiling for this category is ${formatMoney(maxPrincipal)}.`}
        className="relative h-8 w-full overflow-hidden rounded-md bg-surface-sunken"
      >
        {/* What is actually being borrowed. */}
        <div
          style={{ '--share': `${String(borrowedShare)}%` } as CSSProperties}
          className="absolute inset-y-0 left-0 w-[var(--share)] bg-accent"
        />
        {/* The ceiling. A line rather than a second fill: it is a limit, not
            an amount, and drawing it as an amount invites reading it as one
            more thing somebody is asking for. */}
        <div
          style={{ '--share': `${String(ceilingShare)}%` } as CSSProperties}
          className="absolute inset-y-0 left-[var(--share)] w-0.5 bg-status-warning"
        />
      </div>

      {/* Two amounts, not three. The limit stays as the line on the bar,
          because seeing the fill stop short of it is the point of drawing it,
          but as a figure it was money nobody in this market can lend. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Reading label="Borrowed" tone="accent" value={requestedPrincipal} />
        <Reading label="Appraised" tone="plain" value={appraisedValue} />
      </div>

      {/* Not "room left". Since lenders compete on rate alone, nobody can
          use that room, and offering it read as an invitation to lend more.

          What the cap is still for is making the share above readable: the
          same percentage is conservative against a watch and over the line
          against a painting, and only the category's limit says which. */}
      <p className="font-body text-xs text-ink-secondary">
        {`This category is lent against up to ${formatPercentage(categoryCapBasisPoints)} of the appraisal.`}
      </p>
    </figure>
  );
}

/* An escape rather than an HTML numeric entity: the token check scans for a
   hash followed by hex digits, and the entity for this glyph is exactly that
   shape. */
const swatch = '■';

const toneClasses = {
  accent: 'text-accent',
  warning: 'text-status-warning',
  plain: 'text-ink-primary',
} as const;

function Reading({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone: keyof typeof toneClasses;
  readonly value: MoneyValue;
}): ReactElement {
  return (
    <span className="flex items-baseline gap-2">
      {/* A swatch as well as a word, so the label ties to the bar without
          colour being the only thing doing it. */}
      <span aria-hidden="true" className={`text-sm ${toneClasses[tone]}`}>
        {swatch}
      </span>
      <span className="font-body text-xs text-ink-secondary">{label}</span>
      <span className="font-figure text-sm tabular-nums text-ink-primary">
        <CurrencyMark currency={value.currency} /> {formatAmount(value)}
      </span>
    </span>
  );
}
