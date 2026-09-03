import type { Instant } from '../shared/instant';

/* One disagreement between the projection and the chain, named precisely
   enough for a person to act on: which object, which field, both values. */
export interface ChainDrift {
  readonly subjectType: 'wallet' | 'hold' | 'receipt' | 'config';
  readonly subjectId: string;
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}

export interface ChainReconciliationReport {
  /* False on the ledger drivers, where there is no chain to compare. */
  readonly enabled: boolean;
  readonly ranAt: Instant;
  readonly checked: number;
  readonly drift: readonly ChainDrift[];
}

/* Flow 10 gains its third column here: the chain against the database. It is
   a port because the admin screen asks for it and the answer depends on the
   driver in force (docs/superpowers/specs/2026-08-25-web3-migration-design.md). */
export interface ChainReconciliationPort {
  run(): Promise<ChainReconciliationReport>;
}

export const CHAIN_RECONCILIATION_PORT = Symbol('ChainReconciliationPort');
