# p10f-indexer review

Verified at 8af5c79 in a clean worktree at HEAD: `pnpm check` green (the failure in the live
working tree comes from uncommitted p11a files, `packages/ui/src/settlement-reference.spec.tsx`,
not from this slice), and `chain-indexer.integration.spec.ts` passed 2 of 2 against the localnet
at 127.0.0.1:9000. Cursor durability, idempotent inserts through the `chain_event` primary key,
replay reconstruction, drift reported without correction, the operations-only endpoint, the
domain port with no infrastructure imports, and the `enabled: false` stand-in on the ledger
drivers all hold. Commit headers are one line, allowed scopes, under 72 characters; the folded
73-character reconciliation commit is recorded in plan.md and settled by docs/11.

## Blocking
- none

## Non-blocking
- apps/api/test/chain-indexer.integration.spec.ts:86 `harness.app.get(ChainEventIndexer)` returns
  the same singleton, so the docs/06 restart clause is exercised without a fresh instance; hidden
  in-memory cursor state would go unnoticed. Construct a new indexer over the same database.
- apps/api/src/infrastructure/chain/indexer/chain-event.indexer.ts:94 a drain that exhausts
  pagesPerDrain before reaching the known event still advances the cursor to the newest id
  (line 128), permanently skipping the gap until replayFromStart; the bound being hit is silent.
  Log it, or refuse to move the cursor past events never fetched.
- apps/api/src/infrastructure/chain/indexer/chain-reconciliation.ts:52 read() maps every failure
  to null, so an unreachable node reports each row as "missing" drift; an outage is
  indistinguishable from real drift in the report a person acts on.
- apps/api/test/chain-indexer.integration.spec.ts:103 replay equality compares id, eventType,
  digest and json only; checkpoint and sender are not proved identical.
- docs/10-flows.md:418 flow 10 still describes the chain column as per-vault receipts; the
  delivered reconciliation is a separate on-demand endpoint that also checks wallets, holds and
  the pause flag. The spec assigns documentation to p11a-chain-demo; record it there.

## Verdict
APPROVED
