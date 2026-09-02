import { logout } from '@depawn/contracts';
import { ChevronDownIcon, LogOutIcon, Popover } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { currentAccountKeys, useCurrentAccount } from '../current-account';

/* The first letter of the name in front of the address, which is what a
   person calls themselves even when the account is keyed by email. */
function initialOf(email: string): string {
  return (email.trim()[0] ?? '?').toUpperCase();
}

function handleOf(email: string): string {
  return email.split('@')[0] ?? email;
}

/* Who is signed in, and the way out.

   Log out used to sit in the header as a bare button, which gave the most
   destructive control on the screen the same weight as everything beside it
   and never said whose session it would end. Behind the avatar it is one
   step further away and finally has the address next to it. */
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
      label={`Signed in as ${account.email}. Open account menu`}
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
            {initialOf(account.email)}
          </span>
          <span className="text-ink-secondary">
            <ChevronDownIcon />
          </span>
        </>
      }
    >
      <div className="flex flex-col">
        <div className="border-b border-edge px-4 py-3">
          <p className="font-body text-sm font-semibold text-ink-primary">
            {handleOf(account.email)}
          </p>
          {/* The whole address, because two accounts on one machine is the
              normal case in a demo and the handle alone will not separate
              them. */}
          <p className="truncate font-body text-xs text-ink-secondary">{account.email}</p>
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
