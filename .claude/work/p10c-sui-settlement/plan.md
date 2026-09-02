# p10c-sui-settlement plan

Slice 4 of docs/superpowers/plans/2026-08-25-web3-migration.md: the settlement port on Sui,
proven by the same contract suite the ledger adapter passes.

## Tasks

- [x] feat(api): chain settlement tables
- [x] feat(ledger): settle on chain with the ledger as the mirror
- [x] feat(api): map move aborts onto the domain errors the ledger throws (landed inside the p10b unit of work commit, which the submitter needed first)
- [x] feat(api): a localnet test network that publishes per suite
- [x] test(api): the settlement port contract passes against sui

## Found while building

A localnet with the default committee occasionally takes over a minute to checkpoint a
transaction, and every read after a write waits for that. `scripts/localnet.sh` runs one
validator, which made three consecutive runs of the suite green; the submitter's wait is patient
to two minutes and logs anything over five seconds.
