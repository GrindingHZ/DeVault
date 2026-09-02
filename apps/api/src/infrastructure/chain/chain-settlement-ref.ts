import type { Instant } from '../../domain/shared/instant';
import type { SettlementRef } from '../../domain/shared/settlement-ref';

/* A settlement reference for a transaction that has not been built yet. The
   ports hand one out while the unit of work is still collecting commands;
   the digest arrives at commit and the same object then reads it, so a Loan
   that stored the reference before the commit reads the digest after. The
   pending token is what the database patch looks for. */
export class ChainSettlementRef implements SettlementRef {
  readonly kind = 'chain' as const;
  private digest: string | null = null;

  constructor(
    readonly token: string,
    readonly settledAt: Instant,
  ) {}

  get reference(): string {
    return this.digest ?? this.token;
  }

  get isPending(): boolean {
    return this.digest === null;
  }

  resolve(digest: string): void {
    this.digest = digest;
  }

  /* The getter is not an own property, so a serialiser would otherwise write
     the token under its own name and lose the reference the outbox, the
     audit log and the attestation all read. */
  toJSON(): { kind: 'chain'; reference: string; settledAt: Instant } {
    return { kind: this.kind, reference: this.reference, settledAt: this.settledAt };
  }
}

export const pendingReferencePrefix = 'pending:';
