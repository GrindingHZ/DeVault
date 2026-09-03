import type { ReactElement } from 'react';

export type SettlementNetwork = 'localnet' | 'testnet' | 'mainnet';

export interface SettlementReferenceValue {
  readonly kind: 'ledger' | 'chain';
  readonly reference: string;
}

/* Where a chain digest is read on each public network. A local network has
   no explorer, so the digest is shown as text a person can copy. */
const explorerByNetwork: Record<SettlementNetwork, string | null> = {
  localnet: null,
  testnet: 'https://suiscan.xyz/testnet/tx',
  mainnet: 'https://suiscan.xyz/mainnet/tx',
};

function shortTail(reference: string): string {
  return reference.length <= 10 ? reference : `${reference.slice(0, 6)}...${reference.slice(-4)}`;
}

/* One component for the proof a value moved, on both sides of the pivot. A
   ledger reference is a database id shown short and kept whole in the title.
   A chain reference is a transaction digest: a link to the explorer on a
   public network, the same short-and-whole text on a local one, because the
   API shape is identical and only the rendering changes (docs/05-frontend.md,
   docs/08-web3-migration.md). */
export function SettlementReference({
  value,
  network,
}: {
  readonly value: SettlementReferenceValue;
  readonly network: SettlementNetwork | null;
}): ReactElement {
  const explorer = value.kind === 'chain' && network !== null ? explorerByNetwork[network] : null;
  if (explorer !== null) {
    return (
      <a
        href={`${explorer}/${value.reference}`}
        target="_blank"
        rel="noreferrer"
        title={value.reference}
        className="font-mono text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
        data-testid="settlement-reference"
        data-kind="chain"
      >
        {shortTail(value.reference)}
      </a>
    );
  }
  return (
    <span
      title={value.reference}
      className="font-mono text-xs text-ink-secondary"
      data-testid="settlement-reference"
      data-kind={value.kind}
    >
      {shortTail(value.reference)}
    </span>
  );
}
