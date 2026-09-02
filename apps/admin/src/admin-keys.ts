/* Each route file kept its own key object, so the dashboard and the screen
   that acts on the same data could not invalidate each other. Pausing trading
   on the operations screen has to move the dashboard panel that reports it,
   which only works if both name the same key.

   The values match the ones the route files already used, so nothing loses
   its cache on the way to living here. */
export const adminKeys = {
  systemState: ['system-state'] as const,
  audit: (subjectId: string) => ['audit', subjectId] as const,
  liquidations: ['liquidations'] as const,
  loanBook: ['loan-book'] as const,
  exposure: ['exposure-by-vault'] as const,
  reconciliation: ['reconciliation', 'latest'] as const,
  deadLetters: ['dead-letters'] as const,
  metrics: ['request-metrics'] as const,
  parameters: ['protocol-parameters'] as const,
  health: ['health'] as const,
};
