# The loan book becomes self-custodial

Status: designed, ready to plan
Phase: P12
Follows: `docs/superpowers/specs/2026-08-25-web3-migration-design.md`, `docs/08-web3-migration.md`
Supersedes for the Sui layer: the custodial object model of P9 to P11

## The decision this document records

`CLAUDE.md` states the rule that governed every earlier phase: the domain layer must be
identical in Web2 and Web3, and the pivot to Sui is an adapter swap behind two ports. The
custodial migration in P9 to P11 obeyed that rule. The operator key signed every transaction, so
every use case stayed one Prisma transaction plus one programmable transaction, and Postgres versus
Sui was a driver flag.

This phase sets that rule aside on purpose, for the Sui layer only. Self-custody is a capability
Postgres cannot mirror: a claim that lives in the member's own wallet, that only the member can
move, that the platform cannot alter or seize, and that a member can exercise even if the platform
is gone, frozen, or refuses to act. There is no Web2 shape for "the borrower's wallet is the
signer", so there is no adapter that reaches it. Chasing an identical domain here would throw away
the one property that makes the chain worth using.

So the departure is deliberate and named. The Web2 Postgres build remains as the custodial
reference and is not touched. The Sui layer stops being a mirror of it and becomes its own model,
in which the acting member signs, the state and the clock decide, and the platform holds exactly
one capability: the one that vouches for the physical item.

## What inverts, in one table

| Concern | Custodial build (P9 to P11) | Self-custody build (this phase) |
|---|---|---|
| VaultReceipt | shared object, `holder` field, operator moves it | `key, store` object the borrower owns and can transfer |
| Who signs a market action | operator key, always | the acting member's own wallet |
| Offer funds | operator holds from a shared `Wallet` | lender's own USDC coin, held directly |
| Money custody | shared `Wallet<T>` the operator debits | members hold their own USDC in their own wallets |
| Loan position | a Postgres row, a note record | `LenderNote` and `BorrowerNote`, transferable objects the parties own |
| Repayment routing | operator credits the lender's wallet | funds park in the escrow, the note holder pulls them |
| Default claim | operator moves the receipt to the lender | the lender presents the `LenderNote` and takes the receipt |
| Platform on-chain authority | `AdminCap`, `OperatorCap`, `CustodianCap` | `AdminCap` for parameters and pause, `CustodianCap` for the item; no `OperatorCap` on the loan path |
| Source of truth for the API | DB co-written in the settling transaction | chain objects and events, projected by the indexer |
| Secondary market | a Postgres note sale | an atomic swap of the `LenderNote` object |

## Principles

1. **Self-custody for everything that is a member's own claim.** The receipt, both notes, and each
   member's USDC live in that member's wallet. The platform cannot move them.
2. **Custodial for the one thing that is atoms.** The physical item cannot be represented
   trustlessly. The `CustodianCap` vouches that the item is in the vault at intake. Its release at
   the counter is a physical act staff perform against the burn the borrower signs, not an on-chain
   co-signature: one programmable transaction has one sender, so it cannot hold both the borrower's
   receipt and the custodian's capability. This is the irreducible trust root and the only one.
3. **One actor per transaction, and it is the member.** List, offer, cancel, accept, repay, collect,
   claim, and every secondary-market step are signed by the member who acts, not by the platform.
4. **State and the clock decide, keys authorise only real decisions.** A refund after expiry, a
   claim after grace, a loser reclaiming after a match: these are functions of on-chain state and
   need no capability. A key is required only where an off-chain fact or a genuine choice enters the
   chain: which offer the borrower accepts (the borrower signs), and whether the item exists (the
   custodian signs).
5. **Bearer instruments, not accounts.** A note is owed to whoever holds it. The escrow pays the
   presenter. Transfer the note, transfer the claim, with no permission from the counterparty.

## Policy rulings carried in from the brainstorm

These are settled and do not need to be re-litigated in the plan:

- **Both notes are transferable** (`notes_transferable` on `Config`, the existing parameter, stays
  true for the demo). The secondary market is built on transferring the `LenderNote`.
- **Repayment is all or nothing.** A pawn is redeemed in full or forfeited; no partial repayment.
- **Interest accrues pro rata** through `interest::amount_due`, clamped at maturity, truncating in
  the borrower's favour, unchanged from the custodial build.
- **Every offer carries an expiry.** A `FundsHold` records `expires_at`, no earlier than
  `minimum_offer_lifetime_ms` after it is made, so a lender can neither bait then yank before the
  minimum nor leave money committed forever.
- **Grace is a hard cliff.** Past `due + grace_period_ms`, `repay` aborts and `claim` opens. The
  `BorrowerNote` is voided by time, not by a status anyone sets.

## The object catalog

One package, `depawn`, republished fresh. The `config`, `interest`, and `usdc` modules are
unchanged from the custodial build. `custody` and `escrow` change, and a new `pledge` module and a
new `notes` module carry the loan lifecycle.

### VaultReceipt (custody), now owned

```
VaultReceipt has key, store
    id, receipt_key, vault, intake_hash,
    appraised_value, appraised_at_ms, item_category,
    insurance_reference, issued_at_ms
```

The `holder`, `status`, and `encumbered_by` fields are gone: native ownership and wrapping now
encode them. A free receipt is owned by the borrower. A pledged receipt is wrapped inside a
`Pledge`. `store` is what lets the borrower transfer it and what lets a `Pledge` wrap it. `issue`
still takes `&CustodianCap` and now transfers the receipt to the borrower's address rather than
sharing it. `burn_for_redemption` becomes the counter handover below. `transfer_holder`,
`encumber`, `release_encumbrance`, `claim`, and `reissue_to_buyer` are deleted: an owned,
transferable receipt makes all of them either a plain object transfer or a `Pledge` transition.

### Pledge (new module), the shared escrow for the whole lifecycle

The `Pledge` is the one shared object that spans what Web2 modelled as a `Listing` and then a
`Loan`. The receipt stays wrapped inside it from listing to settlement, so it never has to move
between objects, and losing offers can prove they lost by reading its status.

```
Pledge<phantom T> has key            // shared
    id, borrower: address,
    receipt: VaultReceipt,           // wrapped, present from OPEN to close
    status: u8,                      // OPEN, ACTIVE, REPAID, DEFAULTED, CLOSED, CANCELLED
    // populated on acceptance:
    accepted_hold_key, lender_note_id, borrower_note_id,
    principal, apr_bps, started_at_ms, matures_at_ms, grace_period_ms,
    parked: Balance<T>               // empty until repayment parks the payoff here
```

| Function | Signer | Guard | Effect |
|---|---|---|---|
| `open` | borrower | receipt owned by sender | wraps the receipt, shares an OPEN Pledge, `ListingOpened` |
| `cancel` | borrower | OPEN, sender is borrower | unwraps the receipt back to the borrower, CANCELLED, `ListingCancelled` |
| `offer` | lender | OPEN, sender is not the borrower, coin equals the requested principal, rate at or below the asked maximum | locks the lender's USDC in a shared `FundsHold` against this Pledge, `OfferMade` |
| `refund_losing` | anyone | the hold names this Pledge, Pledge not OPEN, the hold is not the accepted one | returns the hold's funds to its owner, `OfferRefunded` |
| `accept` | borrower | OPEN, sender is borrower, hold matches this Pledge, hold not expired, rate at or below the asked maximum | consumes the chosen `FundsHold`, disburses principal to the borrower, mints both notes, sets ACTIVE, `LoanOriginated` |
| `repay` | BorrowerNote holder | ACTIVE, now < matures + grace, coin covers amount due | parks the payoff, releases the receipt to the sender, burns the BorrowerNote, REPAID, `LoanRepaid` |
| `collect` | LenderNote holder | REPAID | withdraws the parked payoff to the sender, burns the LenderNote, CLOSED, `LoanSettled` |
| `claim_default` | LenderNote holder | ACTIVE, now >= matures + grace | releases the receipt to the sender, burns the LenderNote, DEFAULTED, `CollateralClaimed` |

A Pledge is never deleted. CANCELLED and CLOSED are terminal records rather than a missing object,
so a hold made before the close can always prove its loss against the status and be refunded at
once; an object that was gone would leave the hold waiting for its own expiry.

`accept` is the whole origination in one transaction signed once by the borrower: this is "one
signature starts the loan", the reason the offer is a shared object and not a lender-owned one.

### FundsHold (escrow), the offer, now member-made and expiring

```
FundsHold<phantom T> has key         // shared
    id, hold_key, owner: address,
    funds: Balance<T>, pledge_id: ID, expires_at: u64
```

| Function | Signer | Guard | Effect |
|---|---|---|---|
| `make_offer` | package only, through `pledge::offer` | not paused, amount > 0, expiry >= now + minimum lifetime | takes the lender's USDC coin, shares a `FundsHold` against the Pledge, `OfferMade` |
| `refund_losing` | package only, through `pledge::refund_losing` | Pledge not OPEN and this hold is not the accepted one, both read off the Pledge | returns the funds to `owner`, `OfferRefunded` |
| `refund_expired` | anyone | now >= expires_at | returns the funds to `owner`, `OfferRefunded` |

Both refunds are pull, not push, and neither is ever blocked by a pause. The exit door the lender
controls can never be locked, by anyone. `make_offer` is the one entrance a pause closes, the same
rule S2 the custodial `hold` carried.

### LenderNote and BorrowerNote (new module `notes`), the positions

```
LenderNote has key, store
    id, pledge_id: ID, principal, apr_bps,
    started_at_ms, matures_at_ms, original_lender: address

BorrowerNote has key, store
    id, pledge_id: ID, principal, original_borrower: address
```

Both are `key, store`: transferable bearer claims. Only `pledge::accept` can mint them, and only
`pledge::repay`, `collect`, and `claim_default` consume them. `original_lender` and
`original_borrower` are informational, for the read models; the object's current owner is who may
act, and after a transfer that is the buyer. The escrow pays the presenter, so a transferred note
carries its claim with it.

### What leaves

The custodial `escrow` loses `open_wallet`, `withdraw`, `hold`, `begin_release`, `pay`,
`transfer`, and the shared `Wallet<T>` as the member's balance. Members hold their own USDC coins.
A lightweight `Payout` split is retained only where the platform takes a fee: `accept` splits the
origination fee to the platform's address before disbursing the rest, and the fee split is the only
place the hot-potato invariant still guards a distribution.

## The state machines

**Receipt:** owned by borrower, then wrapped in a Pledge, then either released back to the borrower
(cancel or repay) or handed to the lender (default) or burned (redemption). Ownership and wrapping
are the state; there is no status field.

**Pledge:** OPEN to ACTIVE on accept, or OPEN to CANCELLED on cancel. ACTIVE to REPAID on repay,
then REPAID to CLOSED on collect. ACTIVE to DEFAULTED on claim past grace. No path leaves ACTIVE
except through the borrower's repay before the cliff or the lender's claim after it, and the clock
is the only thing that moves the boundary.

**Offer:** an independent `FundsHold` per lender. It ends by being accepted (consumed into the
loan), refunded as a loser once the Pledge matches another hold, or refunded on expiry. A pause
blocks new offers and blocks nothing else.

## The flows, with the signer named

1. **Intake.** Custodian signs with `CustodianCap`. `custody::issue` mints the receipt to the
   borrower's address. Custodial, because only a human can vouch that the gold is in the vault.
2. **Redeem an unpledged item.** Borrower signs alone. `custody::redeem` takes the receipt by
   value from the borrower, burns it, and emits `RedemptionRequested`; staff read that event and
   release the item at the counter, where identity is checked. The burn carries no `CustodianCap`,
   because a single transaction cannot hold both the borrower's receipt and the custodian's
   capability. The claim is self-custodial; the physical handover is the one thing that still
   depends on staff, because it is atoms.
3. **List.** Borrower signs. `pledge::open` wraps the receipt into a shared OPEN Pledge.
4. **Offer.** Lender signs. `pledge::offer` reads the Pledge, refuses one that is not OPEN, and
   locks the lender's USDC in a shared `FundsHold` against it, with an expiry.
5. **Cancel.** Borrower signs. `pledge::cancel` returns the receipt; live offers become refundable.
6. **Accept.** Borrower signs once. `pledge::accept` consumes the chosen hold, sends the principal
   to the borrower minus the origination fee, mints the `LenderNote` to the lender and the
   `BorrowerNote` to the borrower, and turns the Pledge ACTIVE with the receipt still wrapped.
7. **Losing offers.** Each losing lender, or anyone on their behalf, calls `pledge::refund_losing`
   with the Pledge. No wait
   and no permission, because the Pledge's matched status is public.
8. **Repay.** The BorrowerNote holder signs, before the cliff, presenting the note and a USDC coin
   that covers principal plus accrued interest. The payoff parks in the Pledge, the receipt returns
   to the sender, the BorrowerNote burns.
9. **Collect.** The LenderNote holder signs, presenting the note, and pulls the parked payoff. The
   note burns; the Pledge closes.
10. **Default.** Past the cliff, the LenderNote holder signs, presents the note, and takes the
    receipt. The note burns; the Pledge is DEFAULTED. The BorrowerNote is inert because `repay`
    aborts on time.
11. **Secondary market.** The `LenderNote` holder swaps it for USDC atomically (below). The borrower
    is not a party and does not consent; their obligation is unchanged and the payee simply becomes
    whoever holds the note at collect or claim.
12. **Post-default resale.** The lender who holds the receipt transfers it to a buyer with an
    ordinary object transfer, or lists it again as a normal receipt, or redeems the item at the
    counter. There is no special reissue path; an owned receipt makes liquidation ordinary.

## The secondary market as an atomic swap

Selling a position must not be a one-directional `public_transfer`, which would force one side to
trust the other. A `market` module escrows the swap: the seller calls `list_position` to move the
`LenderNote` into a shared `PositionListing` with an ask; a buyer calls `buy_position` with a USDC
coin, which sends the note to the buyer and the coin to the seller in one transaction, or aborts.
This is the same shape as the primary offer and accept, and the same guard against equivocation.
The `BorrowerNote` may be listed the same way, which is a member selling the right to redeem a
valuable item by paying off its loan; whether to enable that is a policy switch, not new mechanism.

## The execution model, and how the API changes

This is the largest architectural consequence and the reason the identical-domain rule cannot hold.

**The member's wallet is the sender, so the API cannot sign.** For every market action the API
builds a programmable transaction with pure builders, validates the preconditions so a bad action
fails with a friendly error before anything is signed, and returns the transaction to the
frontend. The frontend has the connected wallet sign and execute it through dapp-kit's
`useSignAndExecuteTransaction`. The API never holds the member's key.

**The database becomes a projection, not a co-written source of truth.** The custodial
`SuiUnitOfWork` opened a Prisma transaction and a transaction builder together and committed both
atomically. That is impossible when the write happens in the member's wallet, asynchronously. So
the write path is: the member's wallet submits one programmable transaction; the indexer observes
the resulting objects and events; the read models are rebuilt from that stream. The chain is the
source of truth the reconciliation already treats it as, and the DB is the mirror.

**Read-your-writes needs handling.** Between a member signing and the indexer catching up there is a
gap. The frontend holds the transaction digest and the created object ids the wallet returns, and
shows an optimistic pending state keyed on them until the indexer confirms. This is recorded as an
open question below because it touches every write screen.

**What stays operator-signed.** Intake with `CustodianCap`, and pause and parameters with
`AdminCap`. Redemption is signed by the borrower alone; the counter handover is physical. The loan
and money path carries no operator signature at all. The platform can no longer move, freeze, or seize a member's receipt, note, or
USDC, which is the entire point.

**Gas.** The acting member pays their own gas. Sponsored transactions, where the platform pays gas
for a member's action to smooth the experience, are an option recorded as an open question rather
than built now.

## The Move module layout after this phase

| Module | Change |
|---|---|
| `config` | unchanged; `notes_transferable`, `minimum_offer_lifetime_ms`, `grace_period_ms` already present |
| `custody` | `VaultReceipt` becomes `key, store`, owned; `issue` transfers to the borrower; `redeem` replaces `burn_for_redemption`; the encumber, claim, transfer, and reissue functions are deleted |
| `escrow` | keeps `FundsHold` with `expires_at` and `make_offer`, `refund_losing`, `refund_expired`; keeps a minimal `Payout` for the fee split; drops the `Wallet` balance model |
| `pledge` | new: the shared escrow, `open`, `cancel`, `accept`, `repay`, `collect`, `claim_default` |
| `notes` | new: `LenderNote`, `BorrowerNote`, minted only by `pledge::accept`, consumed only by the pledge transitions |
| `market` | new: `list_position`, `buy_position`, the atomic note swap |
| `interest`, `usdc` | unchanged |

## Testing

- **Move:** one test per `assert!`, `#[expected_failure(abort_code = ...)]` for every rejection,
  `test_scenario` for anything crossing a transaction boundary. New coverage: a full pledge
  lifecycle to repayment and to default; a losing offer refunding while a winner originates; an
  expired offer refunding; a note that is transferred before repayment, proving the new holder
  collects and the old holder cannot; a repay after the cliff aborting; a claim before the cliff
  aborting.
- **Builders:** pure functions from input to transaction, asserted on their serialised commands, as
  today. New builders for open, offer, accept, repay, collect, claim, and the swap.
- **Lifecycle on localnet:** origination, repayment, and default each driven by a distinct signer,
  asserting the receipt lands with the right owner and every note is consumed. Because the signer is
  now the member, the test drives three keypairs, not one operator.
- **Secondary market:** a note listed by its holder, bought by a second keypair, then the buyer
  collecting or claiming, proving the payee followed the note.
- **Frontend:** a wallet-signed Playwright path that lists, offers from a second wallet, accepts,
  and repays, extending the existing `pnpm test:e2e:wallet` harness and its fixture keypairs.

## Build order (slices)

1. `p12a-owned-receipt`: `VaultReceipt` becomes `key, store`; `issue` transfers to the borrower;
   `redeem` at the counter; delete the dead custody functions; Move tests.
2. `p12b-pledge-open-cancel`: the `pledge` module with `open` and `cancel`, wrapping and returning
   the receipt; builders; Move and localnet tests.
3. `p12c-offer`: `escrow::make_offer`, `refund_losing`, `refund_expired`, expiry and the minimum
   lifetime; Move and localnet tests.
4. `p12d-accept-and-notes`: the `notes` module and `pledge::accept`, the fee split, both notes
   minted, principal disbursed, one borrower signature; the full origination test.
5. `p12e-repay-collect-default`: the three settlement transitions and the note-transfer test.
6. `p12f-secondary-market`: the `market` module and the atomic swap.
7. `p12g-api-and-frontend`: the pure builders behind the API, the return-transaction endpoints, the
   dapp-kit sign-and-execute wiring, the optimistic pending state, and the indexer projections that
   replace the co-written writes.

Each slice is a vertical: Move, builder, adapter or endpoint, and a test, finished before the next
begins, as the working agreement in `CLAUDE.md` requires.

## Open questions raised

Logged in `docs/OPEN-QUESTIONS.md` as Q-035 to Q-041:

- Read-your-writes across the indexer gap on every write screen.
- Member-paid gas versus sponsored transactions.
- The transferable `LenderNote` as a bearer instrument sharpens the security question of Q-002.
- KYC and who may hold a transferable `BorrowerNote`, the redemption right.
- Lost note key is a lost claim, with no operator recovery: accepted, or an escape hatch.
- Whether platform accounts keep an operator wallet for fee revenue while members do not.
- The atomic-swap object versus a Kiosk with a transfer policy for the secondary market.

## Non-goals

- Rebuilding the Web2 Postgres path to match. It stays as the custodial reference, untouched.
- Migrating existing on-chain custodial objects. The package is republished fresh; there is no
  live money on the demo net to migrate.
- Changing physical logistics, insurance, or the intake evidence flow. Only the on-chain
  representation of title and money changes.
