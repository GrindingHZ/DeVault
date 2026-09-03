import { messageForError } from '@depawn/contracts';
import { Button, Dialog } from '@depawn/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { currentAccountKeys } from '../current-account';
import { signIn } from './landing-copy';
import { useWalletSignIn } from '../wallet/use-wallet-sign-in';

export interface SignInDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/* Signing in happens on the landing page rather than on a page of its own.

   The dialog keeps the argument for the product behind it: a reader who is not
   ready closes it and keeps reading. Members hold their own Sui wallet, so
   connecting one is the only way in and there is no password to keep. */
export function SignInDialog({ isOpen, onClose }: SignInDialogProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const wallet = useWalletSignIn({
    onSuccess: async () => {
      /* Refetched, not invalidated. Invalidation only refetches a query
         something is currently observing, and the landing page behind this
         dialog is already holding the signed out answer. The destination
         would read that stale null and send the reader straight back. */
      await queryClient.refetchQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/portfolio' });
    },
  });

  return (
    <Dialog title={signIn.title} isOpen={isOpen} onClose={onClose}>
      <p className="mb-4 font-body text-sm text-ink-secondary">{signIn.lede}</p>
      <div className="flex flex-col gap-2">
        <Button
          data-testid="wallet-sign-in"
          type="button"
          disabled={wallet.mutation.isPending}
          onClick={() => wallet.mutation.mutate()}
        >
          {wallet.isTestWallet ? 'Sign in with test wallet' : 'Sign in with a Sui wallet'}
        </Button>
        {wallet.mutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageForError(wallet.mutation.error, 'Could not sign in with your wallet. Try again.')}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
