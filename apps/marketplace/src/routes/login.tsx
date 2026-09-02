import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { LandingPage } from '../landing/landing-page';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

/* There is no login page any more. The form is a dialog on the landing page,
   and this route is the landing page with it already open.

   Kept as a route rather than deleted because a bookmark, a stale link and
   every redirect in the product still point here, and because the form having
   its own address is worth keeping even once it stops having its own screen.
   A reader who closes the dialog is left on the argument for the product
   rather than on a blank page. */
function LoginPage(): ReactElement {
  return <LandingPage opensSignIn />;
}
