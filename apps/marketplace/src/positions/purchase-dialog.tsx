import { buyPositionAction, messageForError } from '@depawn/contracts';
import type { NoteSaleSummary } from '@depawn/contracts';
import { Button, Dialog, formatInstant, formatMoney } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from '../market-keys';
import { useFeedback } from '../market-shell';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';
import { walletKeys } from '../wallet-keys';

export interface PurchaseDialogProps {
  readonly sale: NoteSaleSummary | null;
  readonly onClose: () => void;
}

/* The confirmation names exactly what is paid now and what is owed later,
   because a fixed price trade has no quote to go stale: the figure on the
   button is the figure that settles. */
export function PurchaseDialog({ sale, onClose }: PurchaseDialogProps): ReactElement | null {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const sign = useSponsoredWrite();
  const [failure, setFailure] = useState<string | null>(null);

  const purchase = useMutation({
    /* A fixed-price trade: the buyer pays exactly the ask, which the api splits
       from their coin. */
    mutationFn: (noteSaleId: string) => {
      if (sale === null) {
        return Promise.reject(new Error('No sale to buy.'));
      }
      return sign(() =>
        buyPositionAction({
          listingObjectId: noteSaleId,
          askBaseUnits: (BigInt(sale.askPrice.minorUnits) * 10_000n).toString(),
        }),
      );
    },
    onSuccess: async () => {
      setFailure(null);
      await queryClient.invalidateQueries({ queryKey: marketKeys.noteSalesBrowse });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myNoteSales });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      feedback.reportSuccess('The position is yours. Repayment now pays you.');
      onClose();
    },
    onError: (error: unknown) => {
      setFailure(messageForError(error, 'That could not be completed. Nothing has changed.'));
    },
  });

  if (sale === null) {
    return null;
  }

  return (
    <Dialog title="Buy this position" isOpen onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-ink-secondary">
          You take over the lender's claim on {sale.itemDescription}. If the borrower repays, the
          full payoff comes to you; if the loan defaults, the claim on the item is yours.
        </p>
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-body text-sm text-ink-secondary">You pay now</dt>
            <dd className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
              {formatMoney(sale.askPrice)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-body text-sm text-ink-secondary">
              Owed to you at maturity, {formatInstant(sale.maturesAt, 'date')}
            </dt>
            <dd className="font-figure text-sm font-semibold tabular-nums text-ink-primary">
              {formatMoney(sale.maturityValue)}
            </dd>
          </div>
        </dl>
        {failure === null ? null : (
          <p role="alert" className="font-body text-sm text-status-danger">
            {failure}
          </p>
        )}
        <Button
          data-testid="confirm-purchase"
          onClick={() => purchase.mutate(sale.id)}
          disabled={purchase.isPending}
        >
          Pay {formatMoney(sale.askPrice)}
        </Button>
      </div>
    </Dialog>
  );
}
