import { VaultMark } from '@depawn/ui';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { useScrolledPast } from './use-scroll-progress';

/* Two, for a page with four sections. A menu longer than the page it indexes
   is furniture. */
const destinations: readonly { readonly href: string; readonly label: string }[] = [
  { href: '#life', label: 'How it works' },
  { href: '#custody', label: 'Custody' },
];

/* The pill contracts to just the mark once the reader leaves the hero, which
   is the handoff's behaviour and also the honest one: past the fold the page
   is the thing being read and the navigation is a way back, not a menu.

   Left aligned deliberately. The mark is never centred. */
export function LandingNav({ onSignIn }: { readonly onSignIn: () => void }): ReactElement {
  const isCollapsed = useScrolledPast(0.5);
  const currentAccount = useCurrentAccount();
  const isSignedIn = currentAccount.data !== null && currentAccount.data !== undefined;

  return (
    <nav
      aria-label="Landing"
      className="fixed left-6 top-6 z-50 flex items-center gap-3 rounded-full border border-edge bg-surface-raised px-3 py-2 shadow-overlay"
    >
      <a
        href="#top"
        aria-label="DeVault, back to top"
        className="flex shrink-0 items-center rounded-full text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
      >
        <VaultMark size={26} />
      </a>

      {/* Collapsed by width rather than by unmounting, so the links keep their
          place in the tab order and the pill animates instead of jumping. */}
      <div
        aria-hidden={isCollapsed}
        className={`flex items-center gap-4 overflow-hidden transition-all duration-panel ease-enter ${
          isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[40rem] opacity-100'
        }`}
      >
        {destinations.map((destination) => (
          <a
            key={destination.href}
            href={destination.href}
            tabIndex={isCollapsed ? -1 : undefined}
            className="whitespace-nowrap font-body text-sm font-semibold text-ink-secondary transition-colors duration-control ease-enter hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
          >
            {destination.label}
          </a>
        ))}
        {/* The one action. A reader who is already signed in does not need to
            be asked again, so the same slot carries them into the product. */}
        {isSignedIn ? (
          <Link
            to="/portfolio"
            data-testid="landing-sign-in"
            className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
          >
            Your portfolio
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            data-testid="landing-sign-in"
            className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-body text-sm font-semibold text-ink-inverse transition-colors duration-control ease-enter hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active"
          >
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
