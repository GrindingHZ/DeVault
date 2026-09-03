# p11b-wallet-sign-in plan

Slice 9 of docs/superpowers/plans/2026-08-25-web3-migration.md: signing in with a Sui wallet,
which the user asked for by name (Slush). Settling in USDC landed earlier in the pivot.

## Tasks

- [x] feat(domain): let a wallet address be an authenticated subject
- [x] feat(accounts): sign in with a signed challenge
- [x] feat(marketplace-ui): connect a wallet and sign in with it
- [x] test(e2e): sign in with a wallet and see the linked address

## Verified

The wallet sign in was driven end to end in a browser: the app requested a challenge, the test
wallet signed it, the api verified the signature and opened a session, and the marketplace
landed on the portfolio reading "Signed in as 0x...". `pnpm test:e2e:wallet` runs the spec
against a `VITE_TEST_WALLET=1` dev server; the standard suite excludes it because the compose
build carries no test wallet.

## Deferred

A member signed USDC deposit from the connected wallet (the operator deposit tool already funds
any account, including a wallet account, by its address). Recorded as a follow on; the sign in
itself is the slice the user asked for.
