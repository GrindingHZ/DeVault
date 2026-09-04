# DeVault

The Sui package behind the chain drivers: settlement escrow, custody receipts, the pause and
parameter config, attestation of the market's events, and the interest arithmetic the TypeScript
is tested against. Design in `docs/08-web3-migration.md`.

`pnpm move:build` compiles it and `pnpm move:test` runs the unit tests. Both need the `sui`
binary on the path. `pnpm move:fixtures` regenerates `tests/interest_fixtures_tests.move` from
`packages/test-support/src/fixtures/interest.json`.
