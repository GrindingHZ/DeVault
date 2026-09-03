import { ApiError, makeOfferAction, messageForError } from '@depawn/contracts';
import type { ListingDetailResponse } from '@depawn/contracts';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';
import {
  Button,
  Money,
  Slider,
  formatMoney,
  formatRate,
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

/* How long an offer stands before the lender can reclaim the hold. A listing
   has no deadline of its own on chain, so the offer carries the only clock:
   a week is long enough for a borrower to weigh it and short enough that
   money is not parked indefinitely against a listing nobody accepts. */
const offerLifetimeMs = 7 * millisecondsPerDay;

/* The smallest rate the contract accepts. Anything below it is not a cheap
   offer, it is a rejected one. */
const smallestRateBasisPoints = 1;

function withoutSuffix(basisPoints: number): string {
  return formatRate(basisPoints).replace(' p.a.', '');
}

/* Placing an offer commits real money for a month, and the form for it was a
   number in a box. Everything below the control is the consequence of what
   it holds: what the lender earns, where they would stand, and what the
   borrower would repay. All three move as the rate moves.

   The rate is set by dragging rather than by typing. Undercutting is the
   whole mechanic, and a lender doing it by typing has to hold the number to
   beat in their head, compute one below it, and enter the result. On a
   scale, the offer to beat is a mark they can aim at and the ceiling is the
   end of the track. The box is still there, still typable, and shows the
   same figure: some people know the rate they want and should not have to
   hunt for it with a mouse.

   The arithmetic is the server's own, from packages/ui/src/interest.ts, so a
   figure quoted here and the figure charged later cannot disagree. */
export function PlaceOfferForm({
  detail,
}: {
  readonly detail: ListingDetailResponse;
}): ReactElement {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const sign = useSponsoredWrite();
  /* Two pieces of state for one number, on purpose. The box holds what was
     typed, including the half finished states a person passes through, and
     is what the form submits. The slider holds the last figure that parsed,
     so clearing the box to retype it does not throw the handle to one end of
     the track. */
  const [rateInput, setRateInput] = useState('18.00');
  const [sliderBasisPoints, setSliderBasisPoints] = useState(1800);
  const [inputError, setInputError] = useState<string | null>(null);

  const basisPoints = rateToBasisPoints(rateInput);
  const ceiling = detail.maxAnnualPercentageRateBasisPoints;
  const standingRates = detail.offerBook
    .filter((offer) => offer.status === 'PENDING')
    .map((offer) => offer.annualPercentageRateBasisPoints);
  const best = standingRates.length === 0 ? null : Math.min(...standingRates);

  const isAboveCeiling = basisPoints !== null && basisPoints > ceiling;
  const interest =
    basisPoints === null || isAboveCeiling
      ? null
      : interestOver(detail.requestedPrincipal.minorUnits, basisPoints, detail.requestedDurationMs);
  const standing = basisPoints === null ? null : standingAmong(basisPoints, standingRates);
  const days = Math.round(detail.requestedDurationMs / millisecondsPerDay);

  function takeRate(nextBasisPoints: number): void {
    setSliderBasisPoints(nextBasisPoints);
    setRateInput((nextBasisPoints / 100).toFixed(2));
    setInputError(null);
  }

  function takeTypedRate(text: string): void {
    setRateInput(text);
    const parsed = rateToBasisPoints(text);
    if (parsed !== null) {
      setSliderBasisPoints(Math.min(Math.max(parsed, smallestRateBasisPoints), ceiling));
      setInputError(null);
    }
  }

  /* Rule M4: lenders compete by lowering the rate, not by raising the
     principal. So the amount is the one the borrower asked for and is not a
     field. A lender choosing their own amount would be competing on a second
     axis the borrower never opened. */
  const offerMutation = useMutation({
    /* The lender funds the principal the borrower asked for and competes on the
       rate: this offer lends at the rate on the slider, at or below the
       borrower's asked maximum, and the loan is charged that rate if accepted.
       The amount is the requested principal restated in the settlement coin's
       base units. */
    mutationFn: (rateBasisPoints: number) =>
      sign(() =>
        makeOfferAction({
          pledgeId: detail.id,
          amountBaseUnits: (BigInt(detail.requestedPrincipal.minorUnits) * 10_000n).toString(),
          aprBps: rateBasisPoints,
          expiresAtMs: Date.now() + offerLifetimeMs,
        }),
      ),
    onSuccess: async () => {
      feedback.reportSuccess('Your offer is standing, and the money is held.');
      await queryClient.invalidateQueries({ queryKey: marketKeys.detail(detail.id) });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });

  const errorMessage =
    inputError ??
    (isAboveCeiling ? `Above this listing's maximum of ${withoutSuffix(ceiling)}.` : null);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="font-body text-xs font-medium uppercase tracking-wide text-ink-secondary">
        Place an offer
      </h3>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (basisPoints === null) {
            setInputError('Enter a rate like 18.00.');
            return;
          }
          if (isAboveCeiling) {
            return;
          }
          setInputError(null);
          offerMutation.mutate(basisPoints);
        }}
      >
        <div className="flex flex-col gap-1">
          <Slider
            label="Annual rate (% per year)"
            testId="offer-rate-slider"
            value={sliderBasisPoints}
            min={smallestRateBasisPoints}
            max={ceiling}
            onValueChange={takeRate}
            valueText={withoutSuffix}
            /* The offer to beat, drawn on the scale. Undercutting used to be
               a button that did the subtraction; a mark on the track says
               the same thing without deciding by how much. */
            marker={best === null ? undefined : { value: best, label: 'Best' }}
            valueControl={
              <span className="flex items-center gap-1">
                <input
                  data-testid="offer-rate"
                  inputMode="decimal"
                  aria-label="Annual rate, percent per year"
                  aria-invalid={errorMessage !== null}
                  value={rateInput}
                  onChange={(event) => takeTypedRate(event.target.value)}
                  className={[
                    'min-h-8 w-20 rounded-md border bg-surface-raised px-2',
                    'text-right font-figure text-sm tabular-nums text-ink-primary',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
                    errorMessage === null ? 'border-edge-strong' : 'border-status-danger',
                  ].join(' ')}
                />
                <span className="font-body text-sm text-ink-secondary">%</span>
              </span>
            }
          />
          {errorMessage === null ? null : (
            <p role="alert" className="font-body text-sm text-status-danger">
              {errorMessage}
            </p>
          )}
        </div>

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
        Set a rate to see what it earns and where it would stand.
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
