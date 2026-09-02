import { createFileRoute, redirect } from '@tanstack/react-router';

/* Four screens showed one person their own positions in four vocabularies,
   and a single loan appeared twice under two different names depending on
   which one they opened. They are one table now, filtered by side.

   The route stays so every link already written, every bookmark and the demo
   runbook still resolve. Replace rather than push, so the back button returns
   to wherever the reader came from instead of bouncing them through here. */
export const Route = createFileRoute('/lend/loans')({
  beforeLoad: () => {
    throw redirect({ to: '/portfolio', search: { side: 'lending' }, replace: true });
  },
});
