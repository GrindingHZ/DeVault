import { AppBoundary, AppShell, ToastRegion, useMutationFeedback } from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AccountMenu } from './header/account-menu';

interface Feedback {
  readonly reportSuccess: (text: string) => void;
  readonly reportFailure: (text: string) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

/* Staff confirm an irreversible step and then need telling it happened.
   Issuing a receipt and handing one back said nothing at all before this. */
export function useFeedback(): Feedback {
  return (
    useContext(FeedbackContext) ?? {
      reportSuccess: () => undefined,
      reportFailure: () => undefined,
    }
  );
}

/* The custodian shell, on the same floor palette and header as the marketplace
   so the two read as one product. The custodian does only two things, so the
   nav is two tabs: register a receipt, and release one. */
export function ConsoleShell({ children }: { readonly children: ReactNode }): ReactElement {
  const feedback = useMutationFeedback();

  return (
    <AppShell
      productName="DeVault custody"
      surface="floor"
      navigation={
        <>
          <Link to="/mint" className="font-body text-sm text-ink-secondary">
            Register receipt
          </Link>
          <Link to="/releases" className="font-body text-sm text-ink-secondary">
            Release
          </Link>
        </>
      }
      actions={<AccountMenu />}
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
