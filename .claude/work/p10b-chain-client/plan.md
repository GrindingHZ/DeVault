# p10b-chain-client plan

Slice 3 of docs/superpowers/plans/2026-08-25-web3-migration.md: everything between the api and
the node that is not yet a port adapter. Configuration, the deployment the adapters boot from,
the publish script, addresses and wallets, pure builders, and the unit of work that turns a use
case into one programmable transaction.

## Tasks

- [x] feat(api): chain configuration and the deployment it needs
- [x] feat(api): a grpc client and the operator that signs
- [x] feat(api): publish the move package and record the deployment
- [x] feat(api): derive member addresses and remember their wallets
- [x] feat(api): pure builders for every chain call
- [x] test(api): builders produce the expected command shapes
- [x] feat(api): one programmable transaction per unit of work
- [x] test(api): pending references resolve to the digest after commit
- [x] feat(api): assemble the application module at boot rather than at import
