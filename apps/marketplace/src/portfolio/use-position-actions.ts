import {
  claimReceipt,
  markLoanDefaulted,
  publishListing,
  reclaimOffer,
  withdrawOffer,
} from '@depawn/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { marketKeys } from '../market-keys';
import { useFeedback } from '../market-shell';
import { walletKeys } from '../wallet-keys';
import type { Position } from './position';

export interface PositionActionHandlers {
  /* Repaying needs a quote, and collecting an item is a visit to a vault.
     Neither is a button press, so the caller says where they lead: the
     portfolio opens a payoff card, the header notification navigates. */
  readonly onRepay: (position: Position) => void;
  readonly onOpen: (position: Position) => void;
}

function successFor(position: Position): string {
  if (position.action?.kind === 'reclaim') {
    return 'The hold was returned to your balance.';
  }
  if (position.action?.kind === 'publish') {
    return 'The listing is live and taking offers.';
  }
  if (position.action?.kind === 'withdraw') {
    return 'The offer was withdrawn and the hold released.';
  }
  if (position.action?.kind === 'default') {
    return 'The loan is marked defaulted. The collateral is yours to claim.';
  }
  return 'The collateral is yours to collect.';
}

function runAction(position: Position, idempotencyKey: string): Promise<unknown> {
  const options = { idempotencyKey };
  if (position.action?.kind === 'publish' && position.listingId !== null) {
    return publishListing(position.listingId, options);
  }
  if (
    position.action?.kind === 'withdraw' &&
    position.offerId !== null &&
    position.listingId !== null
  ) {
    return withdrawOffer(position.listingId, position.offerId, options);
  }
  if (position.action?.kind === 'reclaim' && position.offerId !== null) {
    return reclaimOffer(position.offerId, options);
  }
  if (position.action?.kind === 'default' && position.loanId !== null) {
    return markLoanDefaulted(position.loanId, options);
  }
  if (position.action?.kind === 'claim' && position.loanId !== null) {
    return claimReceipt(position.loanId, options);
  }
  return Promise.reject(new Error('That position has nothing to act on.'));
}

/* Doing the thing a position is waiting for.

   Shared by the header notification and the portfolio, so the same action
   from two places cannot behave differently or report a different sentence
   afterwards. */
export function usePositionActions(handlers: PositionActionHandlers): {
  readonly actOn: (position: Position) => void;
  readonly isActing: boolean;
} {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const act = useMutation({
    mutationFn: (position: Position) => runAction(position, idempotencyKey),
    onSuccess: async (_result, position) => {
      feedback.reportSuccess(successFor(position));
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('borrower') });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      await queryClient.invalidateQueries({ queryKey: marketKeys.browse });
    },
    onError: () => feedback.reportFailure('That could not be completed. Nothing has changed.'),
  });

  function actOn(position: Position): void {
    if (position.action === null) {
      return;
    }
    if (position.action.kind === 'repay') {
      handlers.onRepay(position);
      return;
    }
    if (position.action.kind === 'accept' || position.action.kind === 'collect') {
      handlers.onOpen(position);
      return;
    }
    act.mutate(position);
  }

  return { actOn, isActing: act.isPending };
}
