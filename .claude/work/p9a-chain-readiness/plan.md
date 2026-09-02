# p9a-chain-readiness plan

Slice 1 of docs/superpowers/plans/2026-08-25-web3-migration.md. Proves the seam before any Move
is written: a chain driver fails at the port boundary and nowhere else, the interest and waterfall
fixtures have one home, the package scaffold builds, and the api resolves the SDK.

## Tasks

- [x] chore(config): add settlement and custody driver switches
- [x] feat(ledger): refuse chain settlement until the adapter exists
- [x] feat(custody): refuse chain custody until the adapter exists
- [x] test(api): flipping a driver to chain fails at the port and nowhere else
- [x] test(domain): read interest and waterfall fixtures from a shared file
- [x] chore(move): scaffold the depawn package
- [x] chore(deps): add the sui sdk and resolve its exports
