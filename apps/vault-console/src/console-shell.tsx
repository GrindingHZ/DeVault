import { logout } from '@depawn/contracts';
import { AppBoundary, AppShell, Button, ToastRegion, useMutationFeedback } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { currentAccountKeys } from './current-account';

interface Feedback {
  readonly reportSuccess: (text: string) => void;
  readonly reportFailure: (text: string) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

/* Staff confirm an irreversible step and then need telling it happened.
   Sealing and issuing said nothing at all before this. */
export function useFeedback(): Feedback {
  return (
    useContext(FeedbackContext) ?? {
      reportSuccess: () => undefined,
      reportFailure: () => undefined,
    }
  );
}

export function ConsoleShell({ children }: { readonly children: ReactNode }): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const feedback = useMutationFeedback();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/login' });
    },
  });

  return (
    <AppShell
      productName="DeVault console"
      surface="terminal"
      navigation={
        <>
          <Link to="/intake" className="font-body text-sm text-ink-secondary">
            Intake
          </Link>
          <Link to="/mint" className="font-body text-sm text-ink-secondary">
            Issue
          </Link>
          <Link to="/inventory" className="font-body text-sm text-ink-secondary">
            Inventory
          </Link>
          <Link to="/releases" className="font-body text-sm text-ink-secondary">
            Releases
          </Link>
          <Link to="/exposure" className="font-body text-sm text-ink-secondary">
            Exposure
          </Link>
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
  );
}
