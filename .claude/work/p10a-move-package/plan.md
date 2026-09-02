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
- [x] feat(move): custodial wallets, holds, and the payout that must be emptied (landed inside the next commit after the hook refused a 73 character header)
- [x] test(move): holds release exactly what they held and refund once
- [x] feat(move): attest domain events beside the settlement that caused them
- [x] feat(move): accrue interest with the borrower's rounding
- [x] test(move): interest agrees with the shared fixtures

## Added after review

- [x] fix(move): open a wallet once when a transfer creates it
- [x] test(move): refuse zero amounts and empty keys
- [x] test(move): leave the interest value cases to the fixtures
- [x] chore(ci): check prose in move sources
- [x] refactor(api): explain the fixture imports and name the mapper

The review also asked for commit c7bff39 to be split so the escrow module lands under a feat
header. docs/11-execution-pipeline.md forbids amending or rebasing a commit already made and
the repository settings deny both commands, so the record stays as it is with this note.
