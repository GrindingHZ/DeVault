import { logout } from '@depawn/contracts';
import {
  AppBoundary,
  AppShell,
  Button,
  Skeleton,
  ToastRegion,
  useMutationFeedback,
} from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AdminNavigation } from './admin-navigation';
import type { AdminNavigationProps } from './admin-navigation';
import { currentAccountKeys, useCurrentAccount } from './current-account';

/* Seven routes each carried their own copy of the shell, the authentication
   check, the role check and the logout mutation. One place instead, which is
   also what makes mounting the boundary and the toast region a single change
   rather than seven. */

interface Feedback {
  readonly reportSuccess: (text: string) => void;
  readonly reportFailure: (text: string) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

/* Screens report the outcome of an action through this rather than each
   holding its own toast state, so two mutations on one screen cannot end up
   with two competing regions. */
export function useFeedback(): Feedback {
  return (
    useContext(FeedbackContext) ?? {
      reportSuccess: () => undefined,
      reportFailure: () => undefined,
    }
  );
}

export interface AdminShellProps {
  readonly current: AdminNavigationProps['current'];
  readonly children: ReactNode;
}

export function AdminShell({ current, children }: AdminShellProps): ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const feedback = useMutationFeedback();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/login' });
    },
  });

  if (currentAccount.isPending) {
    return (
      <main className="p-6">
        <Skeleton lineCount={4} />
      </main>
    );
  }
  if (currentAccount.data === null || currentAccount.data === undefined) {
    return <Navigate to="/login" />;
  }

  const isOperator =
    currentAccount.data.roles.includes('OPERATIONS') ||
    currentAccount.data.roles.includes('COMPLIANCE');
  if (!isOperator) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          You do not have access to the admin console.
        </p>
      </main>
    );
  }

  return (
    <div data-testid="authenticated-home">
      <AppShell
        productName="depawn admin"
        navigation={
          <>
            <AdminNavigation current={current} />
            <span data-testid="account-email">{currentAccount.data.email}</span>
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
            Log out
          </Button>
        }
      >
        <FeedbackContext.Provider
          value={{ reportSuccess: feedback.reportSuccess, reportFailure: feedback.reportFailure }}
        >
          <AppBoundary>{children}</AppBoundary>
        </FeedbackContext.Provider>
        <ToastRegion messages={feedback.messages} onDismiss={feedback.dismiss} />
      </AppShell>
    </div>
  );
}
