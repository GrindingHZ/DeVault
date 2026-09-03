import { listPositionAction, messageForError } from '@depawn/contracts';
import type { LoanResponse } from '@depawn/contracts';
import { Button, Dialog, Field, formatMoney, toMinorUnits } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from '../market-keys';
import { useFeedback } from '../market-shell';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';

export interface SellPositionDialogProps {
  readonly loan: LoanResponse | null;
  readonly onClose: () => void;
}

/* Listing a lent position on the secondary market. The cap is stated up
   front rather than discovered by refusal: the ask can be anything up to
   what the position is worth today, and the discount under that is the
   price of leaving early. */
export function SellPositionDialog({
  loan,
  onClose,
}: SellPositionDialogProps): ReactElement | null {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const sign = useSponsoredWrite();
  const [ask, setAsk] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const currency = loan?.principal.currency ?? 'USD';

  const list = useMutation({
    /* Listing sells the note of a specific loan; the api finds the note from the
       loan, and the ask is restated in the coin's base units. */
    mutationFn: (input: { readonly lenderNoteId: string; readonly minorUnits: string }) => {
      if (loan === null) {
        return Promise.reject(new Error('No position to list.'));
      }
      return sign(() =>
        listPositionAction({
          pledgeId: loan.id,
          askBaseUnits: (BigInt(input.minorUnits) * 10_000n).toString(),
        }),
      );
    },
    onSuccess: async () => {
      setFailure(null);
      setAsk('');
      await queryClient.invalidateQueries({ queryKey: marketKeys.myNoteSales });
      await queryClient.invalidateQueries({ queryKey: marketKeys.noteSalesBrowse });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
      feedback.reportSuccess('Your position is listed for sale.');
      onClose();
    },
    onError: (error: unknown) => {
      setFailure(messageForError(error, 'That could not be completed. Nothing has changed.'));
    },
  });

  if (loan === null) {
    return null;
  }

  /* Two server priced figures added for display, the metricsOf precedent:
     the server still enforces the cap on the write. */
  const worthToday = BigInt(loan.principal.minorUnits) + BigInt(loan.accruedInterest.minorUnits);

  function submit(): void {
    if (loan === null) {
      return;
    }
    const minorUnits = toMinorUnits(ask);
    if (minorUnits === null) {
      setInputError('Enter an amount like 25 or 25.00.');
      return;
    }
    setInputError(null);
    list.mutate({ lenderNoteId: loan.lenderNoteId, minorUnits });
  }

  return (
    <Dialog title="Sell this position" isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="font-body text-sm text-ink-secondary">
          The buyer pays your ask and takes over the loan on {loan.itemDescription}: the payoff, and
          the claim on the item if it defaults. Anything under today's value is their reason to buy.
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-body text-sm text-ink-secondary">
            Worth today, the most you can ask
          </span>
          <span
            data-testid="sale-cap"
            className="font-figure text-sm font-semibold tabular-nums text-ink-primary"
          >
            {formatMoney({ minorUnits: worthToday.toString(), currency })}
          </span>
        </div>
        <Field
          label={`Ask (${currency})`}
          data-testid="ask-input"
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          errorMessage={inputError ?? undefined}
          inputMode="decimal"
          autoFocus
        />
        {failure === null ? null : (
          <p role="alert" className="font-body text-sm text-status-danger">
            {failure}
          </p>
        )}
        <Button type="submit" data-testid="sell-submit" disabled={list.isPending}>
          List for sale
        </Button>
      </form>
    </Dialog>
  );
}
