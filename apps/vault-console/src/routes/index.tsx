import { EmptyState } from '@depawn/ui';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { useCurrentAccount } from '../current-account';
import { StaffGuard } from '../staff-guard';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage(): ReactElement {
  return (
    <StaffGuard>
      <HomeContent />
    </StaffGuard>
  );
}

function HomeContent(): ReactElement {
  const currentAccount = useCurrentAccount();

  return (
    <div data-testid="authenticated-home">
      <ConsoleShell>
        <p data-testid="account-email" className="mb-4 font-body text-sm text-ink-secondary">
          {currentAccount.data?.email ?? currentAccount.data?.walletAddress}
        </p>
        <EmptyState
          title="Issue a receipt"
          description="Use the Issue tab to take an item in and mint its receipt on chain, or Releases to hand an item back when a member collects."
        />
      </ConsoleShell>
    </div>
  );
}
