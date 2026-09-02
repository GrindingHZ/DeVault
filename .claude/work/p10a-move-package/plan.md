# p10a-move-package plan

Slice 2 of docs/superpowers/plans/2026-08-25-web3-migration.md: the package the chain drivers
call. Every abort has an expected failure test, and the interest tests are generated from the
fixture file the TypeScript reads.

## Tasks

- [x] feat(move): a usdc stand in coin for local networks
- [x] feat(move): config with three capabilities, pause, and parameters
- [x] test(move): pause and parameters answer to the admin capability
- [x] feat(move): vault receipts issued and moved by the custodian
- [x] test(move): every receipt transition and its rejections
- [x] feat(move): custodial wallets, holds, and the payout that must be emptied
- [x] test(move): holds release exactly what they held and refund once
- [x] feat(move): attest domain events beside the settlement that caused them
- [x] feat(move): accrue interest with the borrower's rounding
- [ ] test(move): interest agrees with the shared fixtures
