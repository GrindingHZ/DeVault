import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { LandingPage } from '../landing/landing-page';

export const Route = createFileRoute('/')({
  component: HomePage,
});

/* The front door, and the only public route in the marketplace. It does not
   gate on a session: a landing page that bounces a signed out reader to a
   form has nothing to say to anybody who has not already decided. */
function HomePage(): ReactElement {
  return <LandingPage />;
}
