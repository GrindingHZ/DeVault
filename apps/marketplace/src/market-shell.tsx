import { logout } from '@depawn/contracts';
import { AppBoundary, AppShell, Button, ToastRegion, useMutationFeedback } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { currentAccountKeys } from './current-account';
import { MarketContext } from './market-context';
import { MarketRail } from './market-rail';
import { ReclaimBanner } from './reclaim-banner';

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

/* The one authenticated shell for every marketplace screen, so navigation
   stays consistent while routes multiply.

   The whole marketplace runs on the floor scope. The vault console and the
   admin do not: only this application sets the attribute, which is what keeps
   the P0.6 fork to one surface (docs/13-design-system.md). */
export function MarketShell({
  children,
  fills = false,
}: {
  readonly children: ReactNode;
  /* The workspace scrolls its own panes and needs the viewport. Every other
     screen is an ordinary padded document. */
  readonly fills?: boolean;
}): ReactElement {
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
      surface="floor"
      fills={fills}
      productName="DeVault"
      context={<MarketContext />}
      rail={<MarketRail />}
      actions={
        <Button variant="secondary" onClick={() => logoutMutation.mutate()}>
          Log out
        </Button>
      }
    >
      <FeedbackContext.Provider
        value={{ reportSuccess: feedback.reportSuccess, reportFailure: feedback.reportFailure }}
      >
        <ReclaimBanner />
        <AppBoundary>{children}</AppBoundary>
      </FeedbackContext.Provider>
      <ToastRegion messages={feedback.messages} onDismiss={feedback.dismiss} />
    </AppShell>
  );
}
