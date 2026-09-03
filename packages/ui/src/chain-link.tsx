import type { ReactElement } from 'react';

export type ChainReferenceKind = 'transaction' | 'object' | 'address' | 'key';

/* The demo runs on Sui testnet, so every hash resolves on the testnet explorer.
   Kept here so a network move is one edit, not one per call site. */
const explorerBase = 'https://suiscan.xyz/testnet';
const pathByKind: Record<Exclude<ChainReferenceKind, 'key'>, string> = {
  transaction: 'tx',
  object: 'object',
  address: 'account',
};

/* A hash is unreadable in full and useless truncated with no way back to the
   whole, so it shows head and tail and keeps the exact value in the title for a
   copy or a hover. */
function shorten(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}

/* One on-chain hash, shown short and opening its Sui explorer page in a new
   tab. A receipt key is the api's own reference rather than an on-chain
   address, so it is shown but not linked: there is nothing on chain to open. */
export function ChainLink({
  value,
  kind,
  testId,
}: {
  readonly value: string;
  readonly kind: ChainReferenceKind;
  readonly testId?: string;
}): ReactElement {
  if (kind === 'key') {
    return (
      <span data-testid={testId} title={value} className="font-mono text-xs text-ink-secondary">
        {shorten(value)}
      </span>
    );
  }
  return (
    <a
      data-testid={testId}
      href={`${explorerBase}/${pathByKind[kind]}/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
      className="inline-flex items-center gap-1 font-mono text-xs text-status-active underline decoration-dotted underline-offset-2 transition-colors duration-control ease-enter hover:decoration-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active"
    >
      {shorten(value)}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3 w-3 shrink-0"
      >
        <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1h4" />
      </svg>
    </a>
  );
}
