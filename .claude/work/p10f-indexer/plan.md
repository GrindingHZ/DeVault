# p10f-indexer plan

Slice 7 of docs/superpowers/plans/2026-08-25-web3-migration.md: the indexer and reconciliation.

## Tasks

- [x] feat(indexer): chain event table and durable cursor
- [x] feat(indexer): ingest package events idempotently from the node
- [x] feat(operations): reconcile wallets, holds and receipts against the chain
- [x] test(indexer): duplicates, a restart, a replay, and drift

## Note

The reconciliation task's own header, `feat(operations): reconcile wallets, holds and receipts
against the chain`, is 73 characters, one over the limit the commit hook enforces, so its files
landed inside the following `test(indexer)` commit (5fb08c4). docs/11 forbids rebasing a commit
already made, so the record stays here rather than being rewritten.
