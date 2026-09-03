# Self-custody wallet design

**Status:** proposed, 2026-08-26. Supersedes the custodial wallet screen for the
self-custody build on `feat/web-3`.

**Spec it implements against:**
`docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md` (the loan
book), whose contracts (`packages/move/sources/`) define every figure here.

## Goal

Rebuild the marketplace wallet so every money figure reflects what the member
actually holds and is owed on chain, in the self-custody model, rather than a
platform ledger. The member holds their own USDC; the platform holds none.

## The one principle

Money a member controls is in one of two places: free in their wallet, or moved
into an on-chain object (a shared `FundsHold` offer, a shared `Pledge`, or an
owned note). The wallet reads the first place live from the chain, and
reconstructs the rest from the objects those transitions leave behind. No figure
comes from a platform balance, because there is no platform balance any more.

A member is both borrower and lender at once, so the wallet shows several money
states side by side, not one number.

## What every figure is, and how it is calculated

Interest is the contract's formula (`packages/move/sources/interest.move`,
mirrored by `interestOver` in `@depawn/ui`): simple, pro-rated by elapsed time,
clamped at maturity, truncating in the borrower's favour.

```
accrued    = principal * apr_bps * clamp(now - started, 0, matures - started)
             / (10_000 * ms_per_year)
amount_due = principal + accrued
```

| Figure | Meaning | Calculation | Source |
|---|---|---|---|
| **Available to spend** | Free USDC in the wallet | `getBalance(owner, USDC).totalBalance` | Chain, live |
| **Lent out** | Principal at work on active loans you funded | Per owned `LenderNote` whose `Pledge` is ACTIVE: principal = `pledge.principal`; earned so far = `accrued(now)`; value at maturity = `amount_due(matures)`. Sum across notes. | Chain: owned notes plus their pledges |
| **Ready to collect** | Payoff waiting on loans you funded that were repaid | Per owned `LenderNote` whose `Pledge` is REPAID: `pledge.parked` (the `amount_due` fixed at repayment). Sum. | Chain: owned notes plus their pledges |
| **You owe** | Your debt on active loans you borrowed | Per owned `BorrowerNote` whose `Pledge` is ACTIVE: owed today = `amount_due(now)`; owed at maturity = `amount_due(matures)`; deadline = `matures + grace`. Sum. | Chain: owned notes plus their pledges |
| **Committed to offers** | USDC locked in offers you have standing | Sum of `hold.funds` over your `FundsHold` that are still standing (offer made, pledge still OPEN, `now < expires_at`) | Indexer |
| **Reclaimable** | Money in offers that lost or expired, not yet pulled back | Sum of `hold.funds` over your `FundsHold` that lost (pledge accepted another hold) or expired (`now >= expires_at`), and were not refunded | Indexer |
| **Items** | Collateral you hold | Owned `VaultReceipt` objects and their `appraised_value` | Chain |

### Totals and their meaning

- **Cash you control** = Available + Committed + Reclaimable + Ready to collect.
  All of it is, or becomes with one pull, spendable USDC.
- **Working** = Lent principal + interest earned. Becomes cash on repayment, or a
  claimable item on default.
- **You owe** is shown on its own and never added to worth. It is what the member
  will pay, not what they have.

### Two facts the contracts make true, worth showing

- At origination the borrower receives `principal - fee`
  (`fee = principal * origination_fee_bps / 10_000`, taken from the disbursement
  in `pledge::accept`), but repays the full `amount_due`. Their true cost is
  `fee + interest`. The wallet should show the borrower what they received and
  what they will repay, not only the debt.
- The lender collects `parked = amount_due`, that is principal plus interest. The
  fee is the platform's cut off the top of the disbursement, not a charge on the
  lender.

## Architecture: the wallet reads the chain directly

The notes and the receipt are owned objects that carry their own terms
(`packages/move/sources/notes.move`, `custody.move`), so the frontend resolves a
member's whole position from chain reads, with no platform read model in the
path:

1. `useSuiClientQuery('getBalance', { owner, coinType })` for Available.
2. `getOwnedObjects({ owner, filter: { StructType }, options: { showContent } })`
   for the member's `LenderNote`, `BorrowerNote`, and `VaultReceipt` objects.
   Each note yields its `pledge_id` and side.
3. `multiGetObjects(pledgeIds, { showContent })` for the pledges those notes
   point at: `status`, `principal`, `apr_bps`, `started_at_ms`, `matures_at_ms`,
   `grace_period_ms`, and `parked`. Interest is then computed in the browser with
   `interestOver`, against the server clock, never `Date.now()`.

dapp-kit's `SuiClientProvider` already holds a JSON-RPC client on testnet, and
JSON-RPC supports `getOwnedObjects` and `getObject`, which the api's gRPC client
does not. So these reads belong in the frontend, not behind an api endpoint. The
api does not mediate a member's balance.

### The one thing the chain cannot answer: standing offers

A `FundsHold` is a shared object. Its `owner` is a field, not object ownership,
so `getOwnedObjects` never returns it and the frontend cannot enumerate a
member's offers from chain reads alone. Committed and Reclaimable therefore come
from the indexer, which projects the escrow events into a per-owner read model:

- `OfferMade { hold_id, hold_key, owner, amount, pledge_id }` inserts a standing
  hold. The event does not carry `expires_at`; the indexer reads it from the hold
  object once, or the contract adds it to the event (see open questions).
- `OfferAccepted { hold_key, owner, amount, pledge_id }` marks that hold won and
  marks every other standing hold on the same `pledge_id` lost.
- `OfferRefunded { hold_id, hold_key, owner, amount }` marks the hold refunded,
  which removes it from both figures.
- Expiry is read at query time: a standing hold with `now >= expires_at` is
  reclaimable.

Per member: `committed = sum(amount where standing and now < expires_at)`;
`reclaimable = sum(amount where lost, or standing and now >= expires_at, and not
refunded)`.

## The deployment read endpoint

The frontend needs the package id and the settlement coin type to name the coin
in `getBalance` and the struct types in `getOwnedObjects`. Health exposes only
the network today. Add a public read endpoint that returns the recorded
deployment:

```
GET /api/v1/chain/deployment ->
  { packageId, settlementCoinType, settlementCoinDecimals, network }
```

It reads the `chainDeployment` row, so it answers whether or not the settlement
driver is on. This is the single gate for the whole chain-direct read path.

## Formatting

USDC has six decimal places; the current `Money`, `formatMoney`, and
`toMinorUnits` helpers assume two-decimal USD cents. The wallet needs a
coin-aware money layer that formats a `bigint` of base units at the coin's
decimals. This is a real change to the display layer, not a wrapper, and every
figure on the page passes through it.

## The page

Sections, reusing the labels the current UI already writes well
(`position.ts`, `balance-menu.tsx`):

1. **Balance**: Available to spend (live), with Committed, Reclaimable, and Ready
   to collect beside it. Each of the last three carries its pull action
   (reclaim, collect) where there is money to pull.
2. **Lending**: Lent out, interest earned so far, value at maturity. Per-loan
   rows already exist as `positionOfLentLoan`; they keep their shape and change
   their source.
3. **Borrowing**: You owe today, owed at maturity, the term and its deadline.
   Rows from `positionOfBorrowedLoan`.
4. **Items**: receipts the member holds, redeemed or claimed.
5. **Get USDC** (replaces Add funds and Withdraw): on testnet the settlement coin
   is the mintable stand-in USDC, so this is a sponsored mint of USDC to the
   member. On a network without a stand-in it is a faucet link. Withdraw is gone:
   the money is already the member's.
6. **History**: on-chain transactions for the member's address, from the indexer
   or the explorer, replacing the ledger table.

The capital chart (`buildCapitalSeries`) keeps its bands (cash, lent, interest,
defaulted) and changes only its inputs, from ledger entries to the chain and
indexer figures above. It moves to Phase 2 with the rest of the history.

## What is removed

- `fetchBalance`, `withdraw`, `fetchLedgerEntries` and the ledger history table.
- The `available` and `held` figures as a platform ledger. `held` becomes
  Committed, sourced from the escrow objects, not a `USER_HELD` ledger account.

## Reconciliation

The custodial design proved trust by replaying a double-entry ledger to the
reported balance (`reconcilesWith`). Self-custody keeps a stronger check:
Available is the chain balance itself, and the indexer's Committed plus
Reclaimable can be cross-checked against the sum of the member's `FundsHold`
funds read from chain in a background assertion, so a drifted projection is
visible rather than silent.

## Phasing

**Phase 1, buildable now, no indexer:** the deployment endpoint, the coin-aware
money layer, and the chain-direct reads for Available, Lent out, Ready to
collect, You owe, and Items, plus Get USDC. This is the member's whole position
except standing offers.

**Phase 2, after the indexer projects escrow and market events:** Committed,
Reclaimable, on-chain History, and the capital chart re-sourced.

## Open questions

- **Q-042** `OfferMade` does not carry `expires_at`, which the indexer needs to
  compute Reclaimable by expiry. Add `expires_at` to the event, or have the
  indexer read the hold object once on `OfferMade`. The event is cheaper and is
  the narrower change.
- **Q-043** Reading a pledge per owned note is an N+1 of `getObject` calls.
  `multiGetObjects` batches it; if a member holds many notes this may still want
  the indexer. Measure before optimising.
- **Q-044** History for a member's address on testnet: the indexer's projected
  events, or a link out to the explorer for the first cut. Decide in Phase 2.
- **Q-045** Get USDC on testnet mints the stand-in USDC through the operator.
  Confirm the mint is sponsored like every other member action, so the member
  needs no SUI.

## Non-goals

- Cross-member or marketplace-wide balances. This is one member's own wallet.
- Fiat conversion or a USD display of USDC. Figures are USDC.
- Any platform custody of member funds. The platform sponsors gas and mints the
  testnet stand-in coin; it never holds a member's balance.
