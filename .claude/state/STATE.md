# State

phase: P11
slice: p11a-chain-demo
stage: execute
task: 4
slice-base: cdc95f1
started: 2026-08-25T15:30:00Z

The Web2 product is complete. The Web3 pivot is specified in
docs/superpowers/specs/2026-08-25-web3-migration-design.md and planned in
docs/superpowers/plans/2026-08-25-web3-migration.md.

Done and green: p9a (readiness), p10a (Move package, 56 tests), p10b (chain client, builders,
unit of work), p10c (Sui settlement adapter, port contract suite on localnet), p10d (Sui custody
adapter, port contract suite), p10e (pause, parameters, attestation, wiring, the on-chain
lifecycle and pause suites), p10f (indexer and reconciliation, approved). p11a is part done: the
settlement reference component, the health chain field, and the admin deposit link; the compose
localnet service, CI, and the flow and migration docs remain. p11b (wallet sign in with a Sui
wallet, verified end to end in a browser) is done.

Reviews outstanding: p10d and p10e (one fresh review covered both, verdict recorded), p11a, p11b.
Deferred: a member signed USDC deposit from the connected wallet; the remaining p11a docs.
