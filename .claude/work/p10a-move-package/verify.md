# p10a-move-package verify

| Command | Exit | Notes |
|---|---|---|
| `pnpm move:test` | 0 | 56 tests after the review additions: config 7, custody 18, escrow 18, attestation 2, interest 2, usdc 1, generated fixtures 9 |
| `pnpm check` | 0 | 389 modules cruised, prose and tokens clean |
| `pnpm test:unit` | 0 | every workspace green, including the new fixture currency spec |
| `pnpm test:integration` | not re-run | no api behaviour changed in this slice; the p9a run stands |
| `pnpm test:e2e` | not run | no screen changed |

Review: BLOCKED twice on missing expected failure tests and a duplicated event, fixed in cc4524f,
6e9ec1c and a1e6727; the commit split the first review asked for is refused by docs/11 and the
settings, as the plan records; third pass APPROVED.
