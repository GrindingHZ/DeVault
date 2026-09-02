# p10e-config-events-lifecycle plan

Slice 6 of docs/superpowers/plans/2026-08-25-web3-migration.md: the last three adapters, the
wiring, and the test that says the loan book runs on Sui.

## Tasks

- [x] feat(admin): pause the chain config beside the database row
- [x] feat(parameters): mirror parameter versions onto the chain config
- [x] feat(events): attest every domain event in the transaction that caused it
- [x] feat(api): wire the chain adapters behind the driver switches (landed with the three above and with p10b's dynamic application module)
- [x] test(api): a loan originates, repays, defaults and liquidates on chain
- [ ] test(api): pausing on chain blocks holds and never blocks refunds
