import { ApiError, messageForError, placeOffer } from '@depawn/contracts';
import type { ListingDetailResponse } from '@depawn/contracts';
import { Button, Field, Money, toMinorUnits } from '@depawn/ui';
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
    <div className="p-3">
      <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-secondary">
        Place an offer
      </h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const rateBasisPoints = toMinorUnits(rateInput);
          if (rateBasisPoints === null) {
            setInputError('Enter a rate like 18.00.');
            return;
          }
          setInputError(null);
          offerMutation.mutate({ rateBasisPoints: Number(rateBasisPoints) });
        }}
      >
        <p className="font-mono text-xs text-ink-secondary">
          You would lend <Money value={detail.requestedPrincipal} />, which is what the borrower
          asked for. The rate is the only thing you set.
        </p>
        <Field
          label="Annual rate (% per year)"
          data-testid="offer-rate"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Button data-testid="offer-submit" type="submit" disabled={offerMutation.isPending}>
          Place funded offer
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
