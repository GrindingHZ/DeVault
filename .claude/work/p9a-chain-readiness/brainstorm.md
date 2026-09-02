# p9a-chain-readiness brainstorm

The audit and the design live in docs/superpowers/specs/2026-08-25-web3-migration-design.md;
this slice is its first item. What it changes: two driver switches, two stub adapters that fail at
the port, one fixture file for the arithmetic both runtimes share, a package scaffold, and the SDK
resolved by the api. What could break: nothing at runtime while both drivers stay on their Phase 1
values; the tsconfig change is the one edit every file sees, and the whole check and both suites
run after it. Ambiguity: none worth an open question.
