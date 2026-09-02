# p9a-chain-readiness verify

| Command | Exit | Notes |
|---|---|---|
| `pnpm check` | 0 | typecheck, lint, format, boundaries (373 modules), prose, tokens |
| `pnpm test:unit` | 0 | api 31 files, contracts, marketplace, ui all green |
| `pnpm test:integration` | 1, then 0 | first run: 35 of 36 files green; `seed.integration.spec.ts` expected 33 receipts and found 35. The two extra are the receipts the settled sales issue to their buyers since e130b4a, which predates this slice and never updated the count. Corrected in 80a29e5 and the file re-run green |
| `pnpm test:e2e` | not run | no application screen changed in this slice; the six marketplace specs the memory file records as stale from the vault floor redesign remain as they were |
| `sui move build --path packages/move` | 0 | the scaffold builds |

Review: first pass BLOCKED on two findings (an assertion on an error message, inline copies of
fixture cases), fixed in 5b9c63c and 25e275d, second pass recorded in review.md.
