# p9a-chain-readiness plan

Slice 1 of docs/superpowers/plans/2026-08-25-web3-migration.md. Proves the seam before any Move
is written: a chain driver fails at the port boundary and nowhere else, the interest and waterfall
fixtures have one home, the package scaffold builds, and the api resolves the SDK.

## Tasks

- [x] chore(config): add settlement and custody driver switches
- [x] feat(ledger): refuse chain settlement until the adapter exists
- [ ] feat(custody): refuse chain custody until the adapter exists
- [ ] test(api): flipping a driver to chain fails at the port and nowhere else
- [ ] test(domain): read interest and waterfall fixtures from a shared file
- [ ] chore(move): scaffold the depawn package
- [ ] chore(deps): add the sui sdk and resolve it the node way
