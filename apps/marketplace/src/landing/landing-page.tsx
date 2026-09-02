import { useState } from 'react';
import type { ReactElement } from 'react';
import { LandingBook } from './landing-book';
import { LandingCustody } from './landing-custody';
import { LandingHero } from './landing-hero';
import { LandingLiquidity } from './landing-liquidity';
import { LandingNav } from './landing-nav';
import { SignInDialog } from './landing-sign-in';

export interface LandingPageProps {
  /* `/login` renders this page with the dialog already open, so an old link,
     a bookmark or a redirect still lands somewhere that asks for a password
     rather than on a route that no longer exists. */
  readonly opensSignIn?: boolean;
}

export function LandingPage({ opensSignIn = false }: LandingPageProps): ReactElement {
  const [isSignInOpen, setSignInOpen] = useState(opensSignIn);

  return (
    <div
      data-surface="floor"
      data-testid="landing"
      /* Clip rather than hidden. `overflow: hidden` on an ancestor makes it
         the scroll container for everything inside it, which silently kills
         every `position: sticky` on the page. Clip stops the sideways scroll
         without taking the scroll port with it. */
      className="min-h-screen overflow-x-clip bg-surface-base font-body text-ink-primary"
    >
      <LandingNav onSignIn={() => setSignInOpen(true)} />
      <main>
        {/* What it is, what it costs, how much it lends, and what happens
            if you do not repay. Four answers, in the order somebody asks
            them. */}
        <LandingHero onSignIn={() => setSignInOpen(true)} />
        <LandingBook />
        <LandingLiquidity />
        <LandingCustody onSignIn={() => setSignInOpen(true)} />
      </main>
      <SignInDialog isOpen={isSignInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
