import { ApiError, makeOfferAction, messageForError } from '@depawn/contracts';
import type { ListingDetailResponse } from '@depawn/contracts';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';
import { Button, Money, Slider, formatMoney, formatRate, interestOver } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useFeedback } from '../market-shell';
import { marketKeys } from '../market-keys';
import { walletKeys } from '../wallet-keys';

function offerMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The amount is above the lending ceiling for this item.';
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Your available balance does not cover this amount.';
    }
    if (error.code === 'SYSTEM_PAUSED') {
      return 'Trading is paused. Repayments and redemptions are unaffected.';
    }
  }
  return messageForError(error, 'The offer could not be placed.');
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/* One dollar in the settlement currency's minor units, the step the amount
   moves in: cents are the money's smallest unit here, so a lender lends whole
   dollars and the arithmetic stays exact. */
const minorUnitsPerStep = 100;

/* Placing an offer commits real money for the loan's term. The borrower sets
   the rate when they list, and the contract charges that same rate whoever
   funds the loan, so a lender does not set a rate: they compete on how much to
   lend, up to the item's category ceiling. The control is the amount, and
   everything below it is the consequence of what it holds: what the lender
   earns at the borrower's rate, and what the borrower repays.

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

  const currency = detail.requestedPrincipal.currency;
  /* The most a lender may lend against this item: its appraised value scaled by
     the category ceiling, which the api has already resolved into the requested
     principal. */
  const ceilingMinorUnits = BigInt(detail.requestedPrincipal.minorUnits);
  const rateBasisPoints = detail.maxAnnualPercentageRateBasisPoints;
  const days = Math.round(detail.requestedDurationMs / millisecondsPerDay);

  /* Two pieces of state for one number, on purpose. The box holds what was
     typed, including the half finished states a person passes through, and is
     what the form submits. The slider holds the last figure that parsed, so
     clearing the box to retype it does not throw the handle to one end. */
  const ceilingDollars = (Number(ceilingMinorUnits) / minorUnitsPerStep).toFixed(2);
  const [amountInput, setAmountInput] = useState(ceilingDollars);
  const [sliderMinorUnits, setSliderMinorUnits] = useState(Number(ceilingMinorUnits));
  const [inputError, setInputError] = useState<string | null>(null);

  const parsed = parseAmount(amountInput);
  const amountMinorUnits = parsed === null ? null : BigInt(parsed);
  const isOverCeiling = amountMinorUnits !== null && amountMinorUnits > ceilingMinorUnits;
  const isEmpty = amountMinorUnits === null || amountMinorUnits <= 0n;
  const interest =
    amountMinorUnits === null || isEmpty || isOverCeiling
      ? null
      : interestOver(amountMinorUnits.toString(), rateBasisPoints, detail.requestedDurationMs);

  /* The most any standing offer already lends, drawn on the track as the figure
     to match or beat: a borrower prefers the offer that raises them the most. */
  const standingAmounts = detail.offerBook
    .filter((offer) => offer.status === 'PENDING')
    .map((offer) => Number(offer.principal.minorUnits));
  const mostLent = standingAmounts.length === 0 ? null : Math.max(...standingAmounts);

  function takeAmount(nextMinorUnits: number): void {
    setSliderMinorUnits(nextMinorUnits);
    setAmountInput((nextMinorUnits / minorUnitsPerStep).toFixed(2));
    setInputError(null);
  }

  function takeTypedAmount(text: string): void {
    setAmountInput(text);
    const next = parseAmount(text);
    if (next !== null) {
      setSliderMinorUnits(Math.min(next, Number(ceilingMinorUnits)));
      setInputError(null);
    }
  }

  const offerMutation = useMutation({
    mutationFn: (minorUnits: bigint) =>
      sign(() =>
        makeOfferAction({
          pledgeId: detail.id,
          /* The dto's minor units are cents; the settlement coin's base units
             carry the coin's own decimals, so the amount is restated in them. */
          amountBaseUnits: (minorUnits * 10_000n).toString(),
          expiresAtMs: Date.parse(detail.expiresAt),
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
    (isOverCeiling
      ? `Above this item's ceiling of ${formatMoney(detail.requestedPrincipal)}.`
      : null);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="font-body text-xs font-medium uppercase tracking-wide text-ink-secondary">
        Place an offer
      </h3>

      <p className="font-body text-xs text-ink-secondary">
        This borrower pays {formatRate(rateBasisPoints)}, whoever funds the loan. You choose how
        much to lend, up to the item&apos;s ceiling.
      </p>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (amountMinorUnits === null || isEmpty) {
            setInputError('Enter an amount to lend.');
            return;
          }
          if (isOverCeiling) {
            return;
          }
          setInputError(null);
          offerMutation.mutate(amountMinorUnits);
        }}
      >
        <div className="flex flex-col gap-1">
          <Slider
            label="How much to lend"
            testId="offer-amount-slider"
            value={Math.min(sliderMinorUnits, Number(ceilingMinorUnits))}
            min={0}
            max={Number(ceilingMinorUnits)}
            step={minorUnitsPerStep}
            onValueChange={takeAmount}
            valueText={(value) => formatMoney({ minorUnits: String(Math.round(value)), currency })}
            marker={mostLent === null ? undefined : { value: mostLent, label: 'Most lent' }}
            valueControl={
              <span className="flex items-center gap-1">
                <span className="font-body text-sm text-ink-secondary">$</span>
                <input
                  data-testid="offer-amount"
                  inputMode="decimal"
                  aria-label="Amount to lend"
                  aria-invalid={errorMessage !== null}
                  value={amountInput}
                  onChange={(event) => takeTypedAmount(event.target.value)}
                  className={[
                    'min-h-8 w-24 rounded-md border bg-surface-raised px-2',
                    'text-right font-figure text-sm tabular-nums text-ink-primary',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
                    errorMessage === null ? 'border-edge-strong' : 'border-status-danger',
                  ].join(' ')}
                />
              </span>
            }
          />
          {errorMessage === null ? null : (
            <p role="alert" className="font-body text-sm text-status-danger">
              {errorMessage}
            </p>
          )}
        </div>

        <Consequence interest={interest} currency={currency} days={days} rate={rateBasisPoints} />

        <Button
          data-testid="offer-submit"
          type="submit"
          disabled={offerMutation.isPending || isEmpty || isOverCeiling}
        >
          Lend{' '}
          {amountMinorUnits === null || isEmpty ? (
            <Money value={detail.requestedPrincipal} />
          ) : (
            <Money value={{ minorUnits: amountMinorUnits.toString(), currency }} />
          )}
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

/* Cents from a typed dollar amount, or null while the box holds something that
   is not yet a number. Whole cents only, so the money arithmetic never meets a
   fraction of the smallest unit. */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return null;
  }
  return Math.round(dollars * minorUnitsPerStep);
}

function Consequence({
  interest,
  currency,
  days,
  rate,
}: {
  readonly interest: bigint | null;
  readonly currency: string;
  readonly days: number;
  readonly rate: number;
}): ReactElement {
  if (interest === null) {
    return (
      <p className="font-body text-xs text-ink-secondary">
        Set an amount to see what it earns at {formatRate(rate)}.
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
      <Line label="The rate">{formatRate(rate)}</Line>
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
