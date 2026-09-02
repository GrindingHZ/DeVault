import type { ReactElement } from 'react';
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
}

/* An escape rather than an HTML numeric entity. The token check scans for a
   hash followed by hex digits, and a numeric entity for this glyph looks
   exactly like one. */
const bestMarker = '▸';

export interface OfferBookProps {
  readonly offers: readonly OfferBookOffer[];
  readonly role: MarketRole;
  readonly currency: string;
  readonly selectedOfferId?: string | null;
  readonly onSelectOffer?: (offerId: string) => void;
}

/* Money is minor units in a string, so this is bigint and never a float. */
function totalRepayable(principalMinorUnits: bigint, interest: MoneyValue | undefined): bigint {
  return principalMinorUnits + BigInt(interest?.minorUnits ?? '0');
}

/* Lenders compete by lowering the rate, not by raising the principal
   (docs/00-product-overview.md rule M4), and the interface now holds them to
   it: an offer is for the amount the borrower asked for, and the only thing a
   lender chooses is the rate.

   That is why there is no depth column here any more. When every offer is for
   the same amount, a cumulative total is a row count wearing a ladder's
   clothes. The two figures that decide anything are the rate and what it
   costs to repay. */
export function OfferBook({
  offers,
  role,
  currency,
  selectedOfferId,
  onSelectOffer,
}: OfferBookProps): ReactElement {
  const rows = accumulateDepth(offers);

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

  const extras = new Map(offers.map((offer) => [offer.id, offer]));

  return (
    <table className="w-full border-collapse font-mono text-xs tabular-nums">
      <caption className="sr-only">
        Offers on this listing, cheapest first. Rates are per annum.
      </caption>
      <thead>
        <tr className="text-ink-secondary">
          <th scope="col" className="px-3 py-1 text-left font-medium">
            Rate p.a.
          </th>
          <th scope="col" className="px-3 py-1 text-right font-medium">
            To repay
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const extra = extras.get(row.offerId);
          const isSelected = selectedOfferId === row.offerId;
          return (
            <tr
              key={row.offerId}
              data-best={row.isBest ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              className={`h-row-floor border-t border-edge ${
                isSelected ? 'bg-surface-sunken outline outline-1 outline-edge-strong' : ''
              }`}
            >
              <td className="p-0">
                <button
                  type="button"
                  onClick={() => onSelectOffer?.(row.offerId)}
                  aria-pressed={isSelected}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
                >
                  {row.isBest ? (
                    <span aria-hidden="true" className="text-accent">
                      {bestMarker}
                    </span>
                  ) : null}
                  <span className={row.isBest ? 'font-semibold text-accent' : 'text-ink-primary'}>
                    {formatRate(row.annualPercentageRateBasisPoints).replace(' p.a.', '')}
                  </span>
                  {row.isBest ? <span className="text-accent">best</span> : null}
                  {extra?.isMine === true ? (
                    <span className="text-ink-secondary">yours</span>
                  ) : null}
                </button>
              </td>
              <td className="px-3 py-1 text-right text-ink-primary">
                {formatMoney({
                  minorUnits: totalRepayable(
                    row.principalMinorUnits,
                    extra?.totalCostToBorrower,
                  ).toString(),
                  currency,
                })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
