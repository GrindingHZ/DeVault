import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { LandingBook } from '../landing/landing-book';
import { LandingCustody } from '../landing/landing-custody';
import { LandingDefault } from '../landing/landing-default';
import { LandingHero } from '../landing/landing-hero';
import { LandingHow } from '../landing/landing-how';
import { LandingLife } from '../landing/landing-life';
import { LandingLiquidity } from '../landing/landing-liquidity';
import { LandingNav } from '../landing/landing-nav';
import { LandingVault } from '../landing/landing-vault';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

/* The front door, and the only public route in the marketplace.

   It does not gate on a session. A landing page that bounces a signed out
   reader to a login form has nothing to say to anybody who has not already
   decided, which is everybody who arrives here. The sign in button in the nav
   is the way through, and it carries a reader who already has a session
   straight to their portfolio instead of asking them to prove it again. */
function LandingPage(): ReactElement {
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
      <LandingNav />
      <main>
        <LandingHero />
        <LandingHow />
        <LandingBook />
        <LandingLife />
        <LandingVault />
        <LandingLiquidity />
        <LandingDefault />
        {/* Carries the closing footer, because the last argument and the
            close are one thought. */}
        <LandingCustody />
      </main>
    </div>
  );
}
