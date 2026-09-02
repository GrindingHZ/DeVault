import { ApiError, messageForError, placeOffer } from '@depawn/contracts';
import type { ListingDetailResponse } from '@depawn/contracts';
import {
  Button,
  Field,
  Money,
  formatMoney,
  interestOver,
  rateToBasisPoints,
  standingAmong,
} from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useFeedback } from '../market-shell';
import { marketKeys } from '../market-keys';
import { walletKeys } from '../wallet-keys';

function offerMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The principal is above the lending ceiling for this item.';
    }
    if (error.code === 'RATE_ABOVE_MAXIMUM') {
      return 'The rate is above the maximum for this listing.';
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Your available balance does not cover this principal.';
    }
    if (error.code === 'SYSTEM_PAUSED') {
      return 'Trading is paused. Repayments and redemptions are unaffected.';
    }
  }
  return messageForError(error, 'The offer could not be placed.');
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/* Placing an offer commits real money for a month, and the form for it was a
   number in a box. Everything below the field is the consequence of what is
   in it: what the lender earns, where they would stand, and what the borrower
   would repay. All three move as the rate is typed.

   The arithmetic is the server's own, from packages/ui/src/interest.ts, so a
   figure quoted here and the figure charged later cannot disagree. */
export function PlaceOfferForm({
  detail,
}: {
  readonly detail: ListingDetailResponse;
}): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [rateInput, setRateInput] = useState('18.00');
  const [inputError, setInputError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const basisPoints = rateToBasisPoints(rateInput);
  const standingRates = detail.offerBook
    .filter((offer) => offer.status === 'PENDING')
    .map((offer) => offer.annualPercentageRateBasisPoints);
  const best = standingRates.length === 0 ? null : Math.min(...standingRates);

  const isAboveCeiling =
    basisPoints !== null && basisPoints > detail.maxAnnualPercentageRateBasisPoints;
  const interest =
    basisPoints === null || isAboveCeiling
      ? null
      : interestOver(detail.requestedPrincipal.minorUnits, basisPoints, detail.requestedDurationMs);
  const standing = basisPoints === null ? null : standingAmong(basisPoints, standingRates);
  const days = Math.round(detail.requestedDurationMs / millisecondsPerDay);

  /* Rule M4: lenders compete by lowering the rate, not by raising the
     principal. So the amount is the one the borrower asked for and is not a
     field. A lender choosing their own amount would be competing on a second
     axis the borrower never opened. */
  const offerMutation = useMutation({
    mutationFn: (input: { rateBasisPoints: number }) =>
      placeOffer(
        detail.id,
        {
          /* The borrower's own figure, echoed back. The request schema
             narrows the currency, and the detail response does not, so it is
             restated rather than cast. */
          principal: {
            minorUnits: detail.requestedPrincipal.minorUnits,
            currency: 'AUD',
          },
          annualPercentageRateBasisPoints: input.rateBasisPoints,
          durationMs: detail.requestedDurationMs,
          expiresAt: detail.expiresAt,
        },
        { idempotencyKey },
      ),
    onSuccess: async () => {
      feedback.reportSuccess('Your offer is standing, and the money is held.');
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.detail(detail.id) });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="font-body text-xs font-medium uppercase tracking-wide text-ink-secondary">
        Place an offer
      </h3>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (basisPoints === null) {
            setInputError('Enter a rate like 18.00.');
            return;
          }
          setInputError(null);
          offerMutation.mutate({ rateBasisPoints: basisPoints });
        }}
      >
        <Field
          label="Annual rate (% per year)"
          data-testid="offer-rate"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
          errorMessage={
            inputError ??
            (isAboveCeiling
              ? `Above this listing's maximum of ${(detail.maxAnnualPercentageRateBasisPoints / 100).toFixed(2)}%.`
              : undefined)
          }
        />

        {/* Undercutting is the whole mechanic, so it is one click rather than
            a sum the lender does in their head. */}
        {best === null ? null : (
          <button
            type="button"
            data-testid="offer-beat-best"
            onClick={() => setRateInput(((best - 1) / 100).toFixed(2))}
            disabled={best <= 1}
            className="self-start rounded-sm border border-edge-strong px-2 py-1 font-body text-xs text-ink-secondary transition-colors duration-control ease-enter hover:text-ink-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active"
          >
            Undercut the best by 0.01
          </button>
        )}

        <Consequence
          interest={interest}
          currency={detail.requestedPrincipal.currency}
          principalMinorUnits={detail.requestedPrincipal.minorUnits}
          days={days}
          standing={standing}
        />

        <Button
          data-testid="offer-submit"
          type="submit"
          disabled={offerMutation.isPending || basisPoints === null || isAboveCeiling}
        >
          Lend <Money value={detail.requestedPrincipal} />
        </Button>

        {offerMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {offerMessageFor(offerMutation.error)}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Consequence({
  interest,
  currency,
  principalMinorUnits,
  days,
  standing,
}: {
  readonly interest: bigint | null;
  readonly currency: string;
  readonly principalMinorUnits: string;
  readonly days: number;
  readonly standing: {
    readonly position: number;
    readonly total: number;
    readonly isBest: boolean;
  } | null;
}): ReactElement {
  if (interest === null || standing === null) {
    return (
      <p className="font-body text-xs text-ink-secondary">
        Enter a rate to see what it earns and where it would stand.
      </p>
    );
  }

  return (
    <dl
      data-testid="offer-consequence"
      className="flex flex-col gap-2 rounded-md border border-edge bg-surface-sunken p-3"
    >
      <Line label={`You earn over ${String(days)} days`}>
        <span className="font-semibold text-accent">
          {formatMoney({ minorUnits: interest.toString(), currency })}
        </span>
      </Line>
      <Line label="The borrower repays">
        {formatMoney({
          minorUnits: (BigInt(principalMinorUnits) + interest).toString(),
          currency,
        })}
      </Line>
      <Line label="Your place in the book">
        {/* Said in words. A lender's real question is whether they win, and
            "2nd of 4" answers it without them counting rows. */}
        <span className={standing.isBest ? 'font-semibold text-accent' : 'text-ink-primary'}>
          {standing.isBest
            ? 'Best offer'
            : `${String(standing.position)} of ${String(standing.total)}`}
        </span>
      </Line>
    </dl>
  );
}

function Line({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement | string;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-body text-xs text-ink-secondary">{label}</dt>
      <dd className="font-figure text-sm tabular-nums text-ink-primary">{children}</dd>
    </div>
  );
}
