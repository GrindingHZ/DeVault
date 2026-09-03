import { logout } from '@depawn/contracts';
import { ChevronDownIcon, LogOutIcon, Popover } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { AccountResponse } from '@depawn/contracts';
import type { ReactElement } from 'react';
import { currentAccountKeys, useCurrentAccount } from '../current-account';

/* How to name whoever is signed in: their email, or the short tail of the
   wallet address for a custodian who arrived by signing one. */
function identityOf(account: AccountResponse): string {
  if (account.email !== null) {
    return account.email;
  }
  const address = account.walletAddress ?? '';
  return address.length <= 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function initialOf(account: AccountResponse): string {
  if (account.email !== null) {
    return (account.email.trim()[0] ?? '?').toUpperCase();
  }
  return 'W';
}

function handleOf(account: AccountResponse): string {
  return account.email === null
    ? identityOf(account)
    : (account.email.split('@')[0] ?? account.email);
}

/* Who is on the vault floor, and the way out, matched to the marketplace so a
   custodian who also lends sees one identity treatment across both. */
export function AccountMenu(): ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const account = currentAccount.data;

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/login' });
    },
  });

  if (account === null || account === undefined) {
    return null;
  }

  return (
    <Popover
      label={`Signed in as ${identityOf(account)}. Open account menu`}
      testId="account-menu"
      width={260}
      triggerClassName={[
        'inline-flex items-center gap-1 rounded-full p-0.5 pr-1',
        'transition-colors duration-control ease-enter hover:bg-surface-sunken',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
      ].join(' ')}
      trigger={
        <>
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent font-body text-sm font-semibold text-surface-base"
          >
            {initialOf(account)}
          </span>
          <span className="text-ink-secondary">
            <ChevronDownIcon />
          </span>
        </>
      }
    >
      <div className="flex flex-col">
        <div className="border-b border-edge px-4 py-3">
          <p className="font-body text-sm font-semibold text-ink-primary">{handleOf(account)}</p>
          <p className="truncate font-body text-xs text-ink-secondary">{identityOf(account)}</p>
        </div>
        <button
          type="button"
          data-testid="log-out"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 text-left font-body text-sm text-ink-primary transition-colors duration-control ease-enter hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-status-active"
        >
          <span className="text-ink-secondary">
            <LogOutIcon />
          </span>
          Log out
        </button>
      </div>
    </Popover>
  );
}
