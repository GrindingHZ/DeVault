import { describe, expect, it } from 'vitest';
import { Instant } from '../../domain/shared/instant';
import { ChainSettlementRef } from './chain-settlement-ref';

describe('ChainSettlementRef', () => {
  it('reads as the pending token until resolved and as the digest after', () => {
    const ref = new ChainSettlementRef('pending:uow:1', Instant.fromEpochMilliseconds(5n));
    expect(ref.isPending).toBe(true);
    expect(ref.reference).toBe('pending:uow:1');
    ref.resolve('DIGEST');
    expect(ref.isPending).toBe(false);
    expect(ref.reference).toBe('DIGEST');
  });

  it('serialises the reference rather than the token', () => {
    const ref = new ChainSettlementRef('pending:uow:1', Instant.fromEpochMilliseconds(5n));
    const serialised = JSON.stringify({ ref }, (_key, raw: unknown) =>
      typeof raw === 'bigint' ? raw.toString() : raw,
    );
    expect(serialised).toContain('"reference":"pending:uow:1"');
    expect(serialised).not.toContain('token');
  });
});
