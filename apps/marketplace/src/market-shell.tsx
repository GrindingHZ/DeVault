import { AppBoundary, AppShell, ToastRegion, useMutationFeedback } from '@depawn/ui';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AccountMenu } from './header/account-menu';
import { AttentionBell } from './header/attention-bell';
import { BalanceMenu } from './header/balance-menu';
import { MarketRail } from './market-rail';

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
  const feedback = useMutationFeedback();

  return (
    <AppShell
      surface="floor"
      fills={fills}
      productName="DeVault"
      rail={<MarketRail />}
      /* Read from the left: what needs you, what you can spend, who you
         are. Nothing here is a page, which is what keeps them out of the
         rail beside the destinations. */
      actions={
        <>
          <AttentionBell />
          <BalanceMenu />
          <AccountMenu />
        </>
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
