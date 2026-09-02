export const walletKeys = {
  all: ['wallet'] as const,
  balance: ['wallet', 'balance'] as const,
  entries: ['wallet', 'entries'] as const,
  /* The whole ledger rather than a page of it, for the chart that replays it.
     Kept apart from `entries` so the paged history table and the series do
     not evict each other. */
  history: ['wallet', 'history'] as const,
  /* Loans where the reader is the lender. The wallet needs them to know what
     its own cash is worth while it is out working. */
  lentLoans: ['wallet', 'lent-loans'] as const,
};
