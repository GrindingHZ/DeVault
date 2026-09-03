import { claimAction, delistPositionAction, reclaimHoldAction } from '@depawn/contracts';
import type { ChainExecutionResponse, SponsoredTransactionResponse } from '@depawn/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { marketKeys } from '../market-keys';
import { useFeedback } from '../market-shell';
import { useSponsoredWrite } from '../wallet/use-sponsored-write';
import { walletKeys } from '../wallet-keys';
import type { Position } from './position';

type Sign = (build: () => Promise<SponsoredTransactionResponse>) => Promise<ChainExecutionResponse>;

export interface PositionActionHandlers {
  /* Repaying needs a quote, collecting an item is a visit to a vault, and
     selling needs an ask. None is a button press, so the caller says where
     they lead: the portfolio opens the matching card or dialog, the header
     notification navigates. */
  readonly onRepay: (position: Position) => void;
  readonly onOpen: (position: Position) => void;
  readonly onSell: (position: Position) => void;
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
  if (position.action?.kind === 'withdrawSale') {
    return 'The sale is withdrawn. The position is yours again.';
  }
  return 'The collateral is yours to collect.';
}

function runAction(position: Position, sign: Sign): Promise<unknown> {
  /* Claiming after default is one signed move (the contract refuses it inside
     grace), so both the mark and the claim drive it. */
  if (
    (position.action?.kind === 'default' || position.action?.kind === 'claim') &&
    position.loanId !== null
  ) {
    return sign(() => claimAction({ pledgeId: position.loanId as string }));
  }
  if (position.action?.kind === 'withdrawSale' && position.noteSale !== null) {
    const listingObjectId = position.noteSale.id;
    return sign(() => delistPositionAction({ listingObjectId }));
  }
  /* Reclaiming the hold behind a beaten or expired offer, a pull refund the
     escrow allows once the offer has lost or run out. */
  if (position.action?.kind === 'reclaim' && position.offerId !== null && position.listingId !== null) {
    const holdObjectId = position.offerId;
    const pledgeId = position.listingId;
    return sign(() => reclaimHoldAction({ holdObjectId, pledgeId }));
  }
  /* Withdrawing a still-standing offer has no chain move: the escrow only
     refunds a hold once it has expired or lost. */
  return Promise.reject(new Error('That action is not available on chain.'));
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
  const sign = useSponsoredWrite();

  const act = useMutation({
    mutationFn: (position: Position) => runAction(position, sign),
    onSuccess: async (_result, position) => {
      feedback.reportSuccess(successFor(position));
      await queryClient.invalidateQueries({ queryKey: marketKeys.myListings });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myBids });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('borrower') });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
      /* Claiming a defaulted loan moves the receipt into the claimant's own
         name, which is the only thing that says the claim happened: the loan
         stays DEFAULTED. Without this the row goes on offering it. */
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myRedemptions });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myNoteSales });
      await queryClient.invalidateQueries({ queryKey: marketKeys.noteSalesBrowse });
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
    if (position.action.kind === 'sell') {
      handlers.onSell(position);
      return;
    }
    act.mutate(position);
  }

  return { actOn, isActing: act.isPending };
}
