import { messageForError } from '@depawn/contracts';
import { Button, Card } from '@depawn/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { currentAccountKeys } from '../current-account';
import { useWalletSignIn } from '../wallet/use-wallet-sign-in';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

/* Staff sign in with a wallet, the same as a member. The wallet address alone
   decides access: an address the platform authorised as a custodian comes back
   with the staff role, and the staff gate on every screen does the rest. */
function LoginPage(): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const wallet = useWalletSignIn({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/mint' });
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-sm">
        <Card title="Vault custody">
          <p className="mb-4 font-body text-sm text-ink-secondary">
            Sign in with the wallet the platform authorised for the vault.
          </p>
          <Button
            data-testid="wallet-sign-in"
            type="button"
            disabled={wallet.mutation.isPending}
            onClick={() => wallet.mutation.mutate()}
          >
            {wallet.isTestWallet ? 'Sign in with test wallet' : 'Sign in with a Sui wallet'}
          </Button>
          {wallet.mutation.isError ? (
            <p role="alert" className="mt-3 font-body text-sm text-status-danger">
              {messageForError(wallet.mutation.error, 'Could not sign in with your wallet. Try again.')}
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
