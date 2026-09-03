import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { ChainLink } from './chain-link';
import { EmptyState } from './empty-state';
import type { MarketRole } from './market-delta';
import { formatMoney } from './money';
import type { MoneyValue } from './money';
import { accumulateDepth } from './offer-depth';
import type { DepthInput } from './offer-depth';
import { formatRate } from './rate';

export interface OfferBookOffer extends DepthInput {
  readonly totalCostToBorrower?: MoneyValue;
  readonly isMine?: boolean;
  /* The hold in escrow that backs this offer, when the book is read from a
     chain. Spelled with `undefined` for `exactOptionalPropertyTypes`. */
  readonly chainObjectId?: string | undefined;
}

/* An escape rather than an HTML numeric entity. The token check scans for a
   hash followed by hex digits, and a numeric entity for this glyph looks
   exactly like one. */
const bestMarker = '▸';

/* A plain hyphen. The typographic dash a table like this usually wants is an
   em dash, and scripts/check-prose.sh forbids one everywhere, comments and
   copy alike. */
const dash = '-';

export interface OfferBookProps {
  readonly offers: readonly OfferBookOffer[];
  readonly role: MarketRole;
  readonly currency: string;
  /* Both optional together. A book with no way to choose from it renders no
     controls at all, which is the lender's view: the offers are something
     they are competing against rather than something they can take. */
  readonly selectedOfferId?: string | null | undefined;
  readonly onSelectOffer?: ((offerId: string) => void) | undefined;
}

/* Money is minor units in a string, so this is bigint and never a float. */
function totalRepayable(principalMinorUnits: bigint, interest: MoneyValue | undefined): bigint {
  return principalMinorUnits + BigInt(interest?.minorUnits ?? '0');
}

interface BookRow {
  readonly offerId: string;
  readonly rank: number;
  readonly rateBasisPoints: number;
  readonly repayable: bigint;
  /* What this offer costs the borrower above the cheapest one. Zero on the
     best row, which is the figure a reader compares every other row to. */
  readonly premium: bigint;
  readonly premiumShare: number;
  readonly isBest: boolean;
  readonly isMine: boolean;
  readonly chainObjectId: string | null;
}

function buildRows(offers: readonly OfferBookOffer[]): readonly BookRow[] {
  const ordered = accumulateDepth(offers);
  const extras = new Map(offers.map((offer) => [offer.id, offer]));

  const repayables = ordered.map((row) =>
    totalRepayable(row.principalMinorUnits, extras.get(row.offerId)?.totalCostToBorrower),
  );
  const cheapest = repayables[0] ?? 0n;
  const dearest = repayables[repayables.length - 1] ?? 0n;
  const widest = dearest - cheapest;

  return ordered.map((row, index) => {
    const repayable = repayables[index] ?? 0n;
    const premium = repayable - cheapest;
    return {
      offerId: row.offerId,
      rank: index + 1,
      rateBasisPoints: row.annualPercentageRateBasisPoints,
      repayable,
      premium,
      /* Integer arithmetic to a share of ten thousand, then one division for
         a width, like every other proportion in this product. */
      premiumShare: widest <= 0n ? 0 : Number((premium * 10_000n) / widest) / 100,
      isBest: row.isBest,
      isMine: extras.get(row.offerId)?.isMine === true,
      chainObjectId: extras.get(row.offerId)?.chainObjectId ?? null,
    };
  });
}

/* Lenders compete by lowering the rate, not by raising the principal
   (docs/00-product-overview.md rule M4), so every offer is for the sum the
   borrower asked for and the only things that vary are the rate and what it
   costs to repay.

   Which is why there is no depth column. What replaces it is the premium:
   how much more each offer costs the borrower than the cheapest one, drawn
   as a bar. On a book of two that is noise; on a book of forty it is the
   only way to see that rows three to thirty are all within a few dollars of
   each other and row forty is not.

   The rank is first because a lender's question is never "what rates exist",
   it is "where am I". */
export function OfferBook({
  offers,
  role,
  currency,
  selectedOfferId,
  onSelectOffer,
}: OfferBookProps): ReactElement {
  const rows = buildRows(offers);
  /* Radios behave as one choice only when they share a name, and two books
     on one screen must not share one. */
  const groupName = useId();
  const isSelectable = onSelectOffer !== undefined;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No offers yet"
        description={
          role === 'borrower'
            ? 'Lenders have not bid on this listing yet. The rate you pay is whatever the best of them offers.'
            : 'Nobody has bid on this listing yet. The first offer sets the rate to beat.'
        }
      />
    );
  }

  const best = rows[0];
  const worst = rows[rows.length - 1];
  /* The column exists only where there is something to open. A book read
     from the ledger would otherwise carry a heading over a column of
     dashes. */
  const hasChain = rows.some((row) => row.chainObjectId !== null);

  return (
    <div className="flex flex-col">
      {/* Capped and scrolled rather than left to grow. A book of forty would
          otherwise push the form that acts on it off the screen. */}
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full table-fixed border-collapse text-xs tabular-nums">
          <caption className="sr-only">
            {isSelectable
              ? 'Offers on this listing, cheapest first. Rates are per annum. Choose one to accept it.'
              : 'Offers on this listing, cheapest first. Rates are per annum.'}
          </caption>
          {/* One column per heading. The rank and the rate shared a single
              cell until P8h, which left four headings sitting over three
              columns: every label from "Rate p.a." rightward named the
              column to its left. A table cannot align what it cannot
              count. */}
          <colgroup>
            <col className={isSelectable ? 'w-20' : 'w-10'} />
            <col />
            <col />
            <col />
            {hasChain ? <col className="w-40" /> : null}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-sunken">
            <tr className="text-ink-secondary">
              <th scope="col" className="px-2 py-1 text-left font-body font-medium">
                <span className="sr-only">{isSelectable ? 'Choose' : 'Position'}</span>
                <span aria-hidden="true">#</span>
              </th>
              <th scope="col" className="px-2 py-1 text-left font-body font-medium">
                Rate p.a.
              </th>
              <th scope="col" className="px-2 py-1 text-right font-body font-medium">
                To repay
              </th>
              <th scope="col" className="px-2 py-1 text-right font-body font-medium">
                vs best
              </th>
              {hasChain ? (
                <th scope="col" className="px-2 py-1 text-left font-body font-medium">
                  On chain
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BookRowView
                key={row.offerId}
                row={row}
                currency={currency}
                groupName={groupName}
                isSelectable={isSelectable}
                hasChain={hasChain}
                /* Selection is meaningless without a way to change it. A
                   lender arriving on a link that carries an offer id would
                   otherwise see a row singled out and no way to see why. */
                isSelected={isSelectable && selectedOfferId === row.offerId}
                onSelectOffer={onSelectOffer}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* What the book says as a whole, which stops being obvious the moment
          it is longer than the window it sits in. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-edge px-2 py-1 font-body text-xs text-ink-secondary">
        <span>{rows.length === 1 ? '1 offer' : `${String(rows.length)} offers`}</span>
        {best === undefined || worst === undefined || rows.length === 1 ? null : (
          <span className="font-figure tabular-nums">
            {formatRate(best.rateBasisPoints).replace(' p.a.', '')} to{' '}
            {formatRate(worst.rateBasisPoints).replace(' p.a.', '')}
          </span>
        )}
      </p>
    </div>
  );
}

function BookRowView({
  row,
  currency,
  groupName,
  isSelectable,
  hasChain,
  isSelected,
  onSelectOffer,
}: {
  readonly row: BookRow;
  readonly currency: string;
  readonly groupName: string;
  readonly isSelectable: boolean;
  readonly hasChain: boolean;
  readonly isSelected: boolean;
  /* Spelled with `undefined` because the package compiles under
     `exactOptionalPropertyTypes`: an absent prop and a prop holding
     undefined are different types, and the parent passes the second. */
  readonly onSelectOffer?: ((offerId: string) => void) | undefined;
}): ReactElement {
  const choiceId = `${groupName}-${row.offerId}`;
  const repayable = formatMoney({ minorUnits: row.repayable.toString(), currency });

  /* Every cell in a selectable row labels that row's radio, so a pointer
     anywhere along it chooses the offer while the radio stays the only
     control. No click handler on a row, and nothing to reimplement for the
     keyboard. */
  function Choosable({ children }: { readonly children: ReactNode }): ReactElement {
    if (!isSelectable) {
      return <>{children}</>;
    }
    return (
      <label htmlFor={choiceId} className="block cursor-pointer">
        {children}
      </label>
    );
  }

  return (
    <tr
      data-best={row.isBest ? 'true' : undefined}
      data-mine={row.isMine ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      className={[
        'border-t border-edge transition-colors duration-control ease-enter',
        isSelected ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
      ].join(' ')}
    >
      <td
        className={[
          'border-l-2 px-2 py-1',
          isSelected
            ? 'border-l-accent'
            : row.isMine
              ? 'border-l-status-active'
              : 'border-l-transparent',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          {isSelectable ? (
            <input
              type="radio"
              id={choiceId}
              name={groupName}
              checked={isSelected}
              onChange={() => onSelectOffer?.(row.offerId)}
              /* Named in full here rather than left to the cell labels, so a
                 reader hears one sentence that stands on its own instead of
                 four fragments. */
              aria-label={`Offer ${String(row.rank)}, ${formatRate(row.rateBasisPoints)}, repay ${repayable}`}
              className="h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active"
            />
          ) : null}
          <Choosable>
            <span className="font-figure text-ink-secondary">{row.rank}</span>
          </Choosable>
        </span>
      </td>
      <td className="px-2 py-1">
        <Choosable>
          <span className="flex items-center gap-1">
            {row.isBest ? (
              <span aria-hidden="true" className="text-accent">
                {bestMarker}
              </span>
            ) : null}
            <span
              className={`font-figure ${
                row.isBest ? 'font-semibold text-accent' : 'text-ink-primary'
              }`}
            >
              {formatRate(row.rateBasisPoints).replace(' p.a.', '')}
            </span>
            {row.isMine ? <span className="font-body text-status-active">you</span> : null}
          </span>
        </Choosable>
      </td>
      <td className="px-2 py-1 text-right font-figure text-ink-primary">
        <Choosable>{repayable}</Choosable>
      </td>
      {/* The premium, with a bar behind it. A number alone does not show that
          half the book is bunched and the tail is not; a length does it
          without being read. */}
      <td className="relative px-2 py-1 text-right font-figure">
        <span
          aria-hidden="true"
          style={{ '--premium': `${String(row.premiumShare)}%` } as CSSProperties}
          className="pointer-events-none absolute inset-y-0 right-0 w-[var(--premium)] bg-edge-strong opacity-30"
        />
        <Choosable>
          <span
            className={`relative ${row.premium === 0n ? 'text-ink-secondary' : 'text-ink-primary'}`}
          >
            {row.premium === 0n
              ? dash
              : `+${formatMoney({ minorUnits: row.premium.toString(), currency })}`}
          </span>
        </Choosable>
      </td>
      {/* The hold itself, so the money behind a rate can be seen locked
          rather than taken on the book's word. Not choosable: the link is
          the control in this cell, and a click on it must open the explorer
          rather than pick the row. */}
      {hasChain ? (
        <td className="px-2 py-1 text-left">
          {row.chainObjectId === null ? (
            <span className="text-ink-secondary">{dash}</span>
          ) : (
            <ChainLink
              value={row.chainObjectId}
              kind="object"
              testId={`offer-chain-${row.offerId}`}
            />
          )}
        </td>
      ) : null}
    </tr>
  );
}
