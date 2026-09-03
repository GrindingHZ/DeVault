# Self-Custody Loan Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Sui loan book from the custodial object model to a self-custodial one, where the member's own wallet signs every market action and the platform holds only the capability that vouches for the physical item.

**Architecture:** The `VaultReceipt` becomes an owned `key, store` object. A new shared `Pledge` object wraps it for the whole lifecycle. A new `notes` module mints transferable `LenderNote` and `BorrowerNote` bearer instruments. `FundsHold` gains an expiry and pull refunds. A new `market` module swaps positions atomically. Every loan and market function is single-sender and capability-free: it touches shared objects and the one signer's owned objects, so the acting member signs and no operator key appears on the money path. The API stops co-writing the database and instead builds transactions the member's wallet signs, and the indexer projects the result.

**Tech Stack:** Move 2024 (`depawn` package), Sui, `@mysten/sui`, `@mysten/dapp-kit`, NestJS, Prisma, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md`

## Global Constraints

- Move edition `2024`, package name `depawn`, address `depawn = "0x0"` (`packages/move/Move.toml`, unchanged).
- Every loan and market entry function is single-sender: its only owned input is the signer's, everything else is shared or immutable. No function on the loan or market path takes a capability.
- Amounts on chain are the coin's base units; the API codec scales cents by `10^4`. Unchanged from the custodial build.
- Interest is `interest::amount_due`, clamped at maturity, truncating in the borrower's favour. Do not reimplement it.
- Reuse existing `Config` parameters: `minimum_offer_lifetime_ms`, `grace_period_ms`, `origination_fee_bps`, `max_annual_percentage_rate_bps`, `max_loan_to_value_bps`, `notes_transferable`. Accessors already exist (`config.move:139-171`).
- Prose rules are machine-checked (`scripts/check-prose.sh`): no em or en dashes, no curly quotes or ellipsis characters, no emoji, in every `.move`, `.ts`, `.tsx`, and `.md` file. Comments explain why, not what.
- Commit per task. Message is one line `type(scope): lowercase imperative summary`, at most 72 characters, summary all lowercase, no trailing period. Scope from the list in `scripts/check-commit-msg.sh`; use `move` for Move modules, `custody`, `lending`, `marketplace`, `api`, `marketplace-ui`, `indexer`, `e2e` as the file dictates. No body, no trailers.
- `sui move test` green after every Move task; `pnpm check` green before any task is considered done.

## File Structure

- `packages/move/sources/custody.move` (modify): `VaultReceipt` becomes `key, store`, owned; drop `holder`, `status`, `encumbered_by`; `issue` transfers to the borrower; add `redeem`; delete `transfer_holder`, `encumber`, `release_encumbrance`, `claim`, `burn_for_redemption`, `burn_for_liquidation`, `reissue_to_buyer`.
- `packages/move/sources/pledge.move` (create): the shared escrow and its six transitions.
- `packages/move/sources/notes.move` (create): `LenderNote`, `BorrowerNote`, package-visible mint and burn.
- `packages/move/sources/escrow.move` (modify): `FundsHold` gains `pledge_id` and `expires_at`; add `make_offer`, `refund_losing`, `refund_expired`; keep a minimal `Payout` for the fee split; delete the `Wallet` balance model and its functions.
- `packages/move/sources/market.move` (create): `PositionListing`, `list_position`, `buy_position`, `delist_position`.
- `packages/move/sources/config.move` (modify, p12d): add a `fee_recipient: address` field to `Config`, set at init, read by `pledge::accept`.
- `packages/move/tests/*.move` (create/modify): one test file per new module, updated custody and escrow tests.
- `apps/api/src/infrastructure/chain/ptb/` (create): `pledge-calls.ts`, `notes-calls.ts`, `market-calls.ts`; modify `custody-calls.ts`, `escrow-calls.ts`.
- API endpoints and indexer projections in p12g, paths read at execution time against the p12a-f deliverables.

---

## Slice p12a: the owned receipt

### Task 1: VaultReceipt becomes an owned object

**Files:**
- Modify: `packages/move/sources/custody.move`
- Test: `packages/move/tests/custody_tests.move`

**Interfaces:**
- Produces: `custody::issue(&CustodianCap, receipt_key, vault, intake_hash, appraised_value, appraised_at_ms, item_category, insurance_reference, borrower: address, &Clock, &mut TxContext)` transfers a `VaultReceipt` to `borrower`. `custody::redeem(receipt: VaultReceipt)` burns it. `VaultReceipt has key, store` with no `holder`, `status`, or `encumbered_by`. Getters `receipt_key`, `vault`, `appraised_value`, `item_category`, `intake_hash` remain.

- [ ] **Step 1: Write the failing test**

Replace the custody tests that assert on `holder`, `status`, and encumbrance with ownership tests. Add:

```move
#[test]
fun issue_transfers_receipt_to_the_borrower() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    let clock = clock::create_for_testing(scenario.ctx());
    let cap = config::issue_custodian_cap_for_testing(scenario.ctx());
    custody::issue(
        &cap, b"receipt-1", b"vault-a", b"hash", 500_000, 0, 0, b"ins", BORROWER, &clock, scenario.ctx(),
    );
    scenario.next_tx(BORROWER);
    let receipt = scenario.take_from_sender<VaultReceipt>();
    assert!(custody::appraised_value(&receipt) == 500_000, 0);
    scenario.return_to_sender(receipt);
    // cleanup
    config::burn_custodian_cap_for_testing(cap);
    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun redeem_burns_the_receipt() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    let clock = clock::create_for_testing(scenario.ctx());
    let cap = config::issue_custodian_cap_for_testing(scenario.ctx());
    custody::issue(&cap, b"receipt-1", b"vault-a", b"hash", 500_000, 0, 0, b"ins", BORROWER, &clock, scenario.ctx());
    scenario.next_tx(BORROWER);
    let receipt = scenario.take_from_sender<VaultReceipt>();
    custody::redeem(receipt);
    scenario.next_tx(BORROWER);
    assert!(!scenario.has_most_recent_for_sender<VaultReceipt>(), 0);
    config::burn_custodian_cap_for_testing(cap);
    clock.destroy_for_testing();
    scenario.end();
}
```

If `config` lacks `issue_custodian_cap_for_testing`, add the `#[test_only]` helper in this step (mint and return a `CustodianCap`, and a matching burn helper).

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test issue_transfers`
Expected: FAIL, `issue` arity and `VaultReceipt` fields do not match.

- [ ] **Step 3: Rewrite the module**

Change the struct and functions:

```move
public struct VaultReceipt has key, store {
    id: UID,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    intake_hash: vector<u8>,
    appraised_value: u64,
    appraised_at_ms: u64,
    item_category: u8,
    insurance_reference: vector<u8>,
    issued_at_ms: u64,
}

public fun issue(
    _: &CustodianCap,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    intake_hash: vector<u8>,
    appraised_value: u64,
    appraised_at_ms: u64,
    item_category: u8,
    insurance_reference: vector<u8>,
    borrower: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!receipt_key.is_empty(), EEmptyKey);
    assert!(appraised_value > 0, EZeroValue);
    let receipt = VaultReceipt {
        id: object::new(ctx),
        receipt_key, vault, intake_hash, appraised_value, appraised_at_ms,
        item_category, insurance_reference, issued_at_ms: clock.timestamp_ms(),
    };
    event::emit(ReceiptIssued {
        receipt_id: object::id(&receipt), receipt_key: receipt.receipt_key,
        vault: receipt.vault, holder: borrower,
        appraised_value: receipt.appraised_value, item_category: receipt.item_category,
    });
    transfer::public_transfer(receipt, borrower);
}

public fun redeem(receipt: VaultReceipt) {
    let VaultReceipt { id, receipt_key, .. } = receipt;
    let receipt_id = id.to_inner();
    id.delete();
    event::emit(RedemptionRequested { receipt_id, receipt_key });
}
```

Delete `transfer_holder`, `encumber`, `release_encumbrance`, `claim`, `burn_for_redemption`, `burn_for_liquidation`, `reissue_to_buyer`, and the `IN_VAULT`/`ENCUMBERED` constants, the `status`/`encumbered_by` getters, and the `ENotInVault`/`ENotEncumbered` codes. Drop `holder` from `RedemptionRequested` (keep it on `ReceiptIssued` as the mint target). The `share_object` path is gone; the receipt is transferred.

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test custody`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/custody.move packages/move/sources/config.move packages/move/tests/custody_tests.move
git commit -m "refactor(custody): make the vault receipt an owned object"
```

---

## Slice p12b: the pledge, open and cancel

### Task 2: Create the pledge module with open and cancel

**Files:**
- Create: `packages/move/sources/pledge.move`
- Test: `packages/move/tests/pledge_tests.move`

**Interfaces:**
- Consumes: `custody::VaultReceipt` (owned, by value), `custody::receipt_key`.
- Produces: `pledge::open<T>(receipt: VaultReceipt, requested_apr_bps: u16, ctx)` shares a `Pledge<T>` with `status == OPEN` and the receipt wrapped. `pledge::cancel<T>(pledge: Pledge<T>, ctx)` returns the receipt to the borrower and deletes the pledge. `Pledge` getters: `borrower`, `status`, `pledge_status_open()`, `pledge_status_active()`. Constants exported as test-only getters.

- [ ] **Step 1: Write the failing test**

```move
#[test]
fun open_wraps_the_receipt_and_shares_an_open_pledge() {
    let mut scenario = test_scenario::begin(BORROWER);
    let receipt = mint_receipt_to(&mut scenario, BORROWER);   // helper minting via a test custodian cap
    scenario.next_tx(BORROWER);
    pledge::open<USDC>(receipt, 3600, scenario.ctx());
    scenario.next_tx(BORROWER);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    assert!(pledge::borrower(&pledge) == BORROWER, 0);
    assert!(pledge::is_open(&pledge), 1);
    test_scenario::return_shared(pledge);
    scenario.end();
}

#[test]
fun cancel_returns_the_receipt_to_the_borrower() {
    let mut scenario = test_scenario::begin(BORROWER);
    let receipt = mint_receipt_to(&mut scenario, BORROWER);
    scenario.next_tx(BORROWER);
    pledge::open<USDC>(receipt, 3600, scenario.ctx());
    scenario.next_tx(BORROWER);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());
    scenario.next_tx(BORROWER);
    assert!(scenario.has_most_recent_for_sender<VaultReceipt>(), 0);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotBorrower)]
fun cancel_rejects_a_stranger() {
    let mut scenario = test_scenario::begin(BORROWER);
    let receipt = mint_receipt_to(&mut scenario, BORROWER);
    scenario.next_tx(BORROWER);
    pledge::open<USDC>(receipt, 3600, scenario.ctx());
    scenario.next_tx(STRANGER);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());   // aborts
    abort 42
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test pledge`
Expected: FAIL, module `pledge` does not exist.

- [ ] **Step 3: Write the module**

```move
module depawn::pledge;

use depawn::custody::VaultReceipt;
use sui::balance::{Self, Balance};

const OPEN: u8 = 0;
const ACTIVE: u8 = 1;
const REPAID: u8 = 2;
const DEFAULTED: u8 = 3;
const CLOSED: u8 = 4;
const CANCELLED: u8 = 5;

const ENotBorrower: u64 = 0;
const ENotOpen: u64 = 1;

public struct Pledge<phantom T> has key {
    id: UID,
    borrower: address,
    requested_apr_bps: u16,
    receipt: Option<VaultReceipt>,
    status: u8,
    accepted_hold_key: vector<u8>,
    lender_note_id: Option<ID>,
    borrower_note_id: Option<ID>,
    principal: u64,
    apr_bps: u16,
    started_at_ms: u64,
    matures_at_ms: u64,
    grace_period_ms: u64,
    parked: Balance<T>,
}

public struct ListingOpened has copy, drop { pledge_id: ID, borrower: address, receipt_key: vector<u8> }
public struct ListingCancelled has copy, drop { pledge_id: ID, receipt_key: vector<u8> }

public fun open<T>(receipt: VaultReceipt, requested_apr_bps: u16, ctx: &mut TxContext) {
    let pledge = Pledge<T> {
        id: object::new(ctx),
        borrower: ctx.sender(),
        requested_apr_bps,
        receipt: option::some(receipt),
        status: OPEN,
        accepted_hold_key: vector[],
        lender_note_id: option::none(),
        borrower_note_id: option::none(),
        principal: 0, apr_bps: 0, started_at_ms: 0, matures_at_ms: 0, grace_period_ms: 0,
        parked: balance::zero(),
    };
    let held = pledge.receipt.borrow();
    event::emit(ListingOpened {
        pledge_id: object::id(&pledge), borrower: pledge.borrower,
        receipt_key: *held.receipt_key(),
    });
    transfer::share_object(pledge);
}

public fun cancel<T>(pledge: Pledge<T>, ctx: &mut TxContext) {
    assert!(pledge.borrower == ctx.sender(), ENotBorrower);
    assert!(pledge.status == OPEN, ENotOpen);
    let Pledge { id, borrower, mut receipt, parked, .. } = pledge;
    let pledge_id = id.to_inner();
    let item = receipt.extract();
    receipt.destroy_none();
    parked.destroy_zero();
    event::emit(ListingCancelled { pledge_id, receipt_key: *item.receipt_key() });
    transfer::public_transfer(item, borrower);
    id.delete();
}

public fun borrower<T>(pledge: &Pledge<T>): address { pledge.borrower }
public fun status<T>(pledge: &Pledge<T>): u8 { pledge.status }
public fun is_open<T>(pledge: &Pledge<T>): bool { pledge.status == OPEN }
public fun is_active<T>(pledge: &Pledge<T>): bool { pledge.status == ACTIVE }
```

Wrap the receipt in `Option` so later transitions can `extract` it without a sentinel receipt. Add `use sui::event;` at the top.

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test pledge`
Expected: PASS, including the `ENotBorrower` rejection.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/pledge.move packages/move/tests/pledge_tests.move
git commit -m "feat(move): open and cancel a pledge holding the receipt"
```

---

## Slice p12c: the offer

### Task 3: FundsHold becomes a member-made, expiring offer

**Files:**
- Modify: `packages/move/sources/escrow.move`
- Test: `packages/move/tests/escrow_tests.move`

**Interfaces:**
- Consumes: `Config` (shared, `assert_not_paused`, `minimum_offer_lifetime_ms`), `Coin<T>`.
- Produces: `escrow::make_offer<T>(&Config, pledge_id: ID, hold_key, payment: Coin<T>, expires_at: u64, &Clock, ctx)` shares a `FundsHold<T>`. `escrow::refund_expired<T>(FundsHold<T>, &Clock, ctx)` and `escrow::refund_losing<T>(FundsHold<T>, pledge_matched: bool, accepted_hold_key: vector<u8>, ctx)` send the funds back to `owner`. Getters `hold_owner`, `hold_amount`, `hold_pledge_id`, `hold_expires_at`. A package-visible `into_principal` (below) is added in p12d.

- [ ] **Step 1: Write the failing test**

```move
#[test]
fun make_offer_locks_the_lenders_coin() {
    let mut scenario = test_scenario::begin(LENDER);
    let (config, admin) = config::new_for_testing(scenario.ctx());
    let clock = clock_at(&mut scenario, 1_000);
    let coin = mint_usdc(&mut scenario, 400_000);
    escrow::make_offer(&config, dummy_pledge_id(), b"hold-1", coin, 1_000 + 600_000, &clock, scenario.ctx());
    scenario.next_tx(LENDER);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    assert!(escrow::hold_amount(&hold) == 400_000, 0);
    assert!(escrow::hold_owner(&hold) == LENDER, 1);
    test_scenario::return_shared(hold);
    // teardown config, admin, clock
    ...
}

#[test, expected_failure(abort_code = escrow::EOfferTooShort)]
fun make_offer_rejects_an_expiry_inside_the_minimum() { ... expires_at just after now ... }

#[test]
fun refund_expired_returns_the_coin_to_the_owner() { ... advance clock past expiry, assert LENDER holds a Coin<USDC> of 400_000 ... }
```

`config::new_for_testing` returns a shared-ready `Config` and its `AdminCap`; add it as a `#[test_only]` helper if absent, defaulting `minimum_offer_lifetime_ms` to `600_000`.

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test make_offer`
Expected: FAIL, `make_offer` and `EOfferTooShort` do not exist.

- [ ] **Step 3: Rewrite the offer half of escrow**

```move
public struct FundsHold<phantom T> has key {
    id: UID,
    hold_key: vector<u8>,
    owner: address,
    funds: Balance<T>,
    pledge_id: ID,
    expires_at: u64,
}

const EOfferTooShort: u64 = 5;

public fun make_offer<T>(
    config: &Config,
    pledge_id: ID,
    hold_key: vector<u8>,
    payment: Coin<T>,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    config.assert_not_paused();
    assert!(!hold_key.is_empty(), EEmptyKey);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    assert!(expires_at >= clock.timestamp_ms() + minimum, EOfferTooShort);
    let hold = FundsHold<T> {
        id: object::new(ctx), hold_key, owner: ctx.sender(),
        funds: payment.into_balance(), pledge_id, expires_at,
    };
    event::emit(FundsHeld { hold_id: object::id(&hold), hold_key: hold.hold_key, owner: hold.owner, amount, reference: pledge_id.to_bytes() });
    transfer::share_object(hold);
}

public fun refund_expired<T>(hold: FundsHold<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(clock.timestamp_ms() >= hold.expires_at, ENotExpired);
    refund(hold, ctx);
}

public fun refund_losing<T>(hold: FundsHold<T>, pledge_matched: bool, accepted_hold_key: vector<u8>, ctx: &mut TxContext) {
    assert!(pledge_matched, EStillOpen);
    assert!(accepted_hold_key != hold.hold_key, EWon);
    refund(hold, ctx);
}

fun refund<T>(hold: FundsHold<T>, ctx: &mut TxContext) {
    let FundsHold { id, hold_key, owner, funds, .. } = hold;
    let amount = funds.value();
    let hold_id = id.to_inner();
    id.delete();
    event::emit(HoldRefunded { hold_id, hold_key, owner, amount });
    transfer::public_transfer(coin::from_balance(funds, ctx), owner);
}
```

Delete `Wallet<T>`, `open_wallet`, `deposit`, `deposit_new`, `withdraw`, the old `hold`, `refund_hold`, `transfer`, `transfer_new`, and their events (`WalletOpened`, `FundsDeposited`, `FundsWithdrawn`). Keep `Payout`, `begin_release` renamed as an internal helper, `pay`, `pay_new`, `finish_release` for the p12d fee split. Add codes `ENotExpired`, `EStillOpen`, `EWon`. The `refund_losing` boolean and key are passed by the caller in p12d, computed from the `Pledge` in the same transaction. Note in a comment: the caller reads the pledge's `status` and `accepted_hold_key` and passes them, because `escrow` must not depend on `pledge` (keeps the module graph acyclic).

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test escrow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/escrow.move packages/move/tests/escrow_tests.move
git commit -m "feat(move): make offers member-owned holds that expire"
```

---

## Slice p12d: acceptance and the notes

### Task 4: The notes module

**Files:**
- Create: `packages/move/sources/notes.move`
- Test: `packages/move/tests/notes_tests.move`

**Interfaces:**
- Produces: `LenderNote has key, store`, `BorrowerNote has key, store`. Package-visible `notes::mint_lender_note(pledge_id, principal, apr_bps, started_at_ms, matures_at_ms, lender, ctx): LenderNote`, `notes::mint_borrower_note(pledge_id, principal, borrower, ctx): BorrowerNote`, `notes::burn_lender_note(LenderNote): ID` (returns `pledge_id`), `notes::burn_borrower_note(BorrowerNote): ID`, and getters `lender_note_pledge`, `borrower_note_pledge`, `lender_note_principal`, etc. Mint and burn are `public(package)` so only `pledge` calls them.

- [ ] **Step 1: Write the failing test**

```move
#[test]
fun a_burned_lender_note_yields_its_pledge_id() {
    let mut scenario = test_scenario::begin(LENDER);
    let id = notes::test_mint_and_burn_lender(scenario.ctx());  // test-only wrapper over the package fns
    assert!(id == notes::test_expected_pledge_id(), 0);
    scenario.end();
}
```

Because mint and burn are `public(package)`, expose thin `#[test_only]` wrappers in `notes` for the unit test, and cover the real path in the pledge lifecycle test in Task 6.

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test notes`
Expected: FAIL, module `notes` does not exist.

- [ ] **Step 3: Write the module**

```move
module depawn::notes;

public struct LenderNote has key, store {
    id: UID,
    pledge_id: ID,
    principal: u64,
    apr_bps: u16,
    started_at_ms: u64,
    matures_at_ms: u64,
    original_lender: address,
}

public struct BorrowerNote has key, store {
    id: UID,
    pledge_id: ID,
    principal: u64,
    original_borrower: address,
}

public(package) fun mint_lender_note(
    pledge_id: ID, principal: u64, apr_bps: u16, started_at_ms: u64, matures_at_ms: u64,
    lender: address, ctx: &mut TxContext,
): LenderNote {
    LenderNote { id: object::new(ctx), pledge_id, principal, apr_bps, started_at_ms, matures_at_ms, original_lender: lender }
}

public(package) fun mint_borrower_note(pledge_id: ID, principal: u64, borrower: address, ctx: &mut TxContext): BorrowerNote {
    BorrowerNote { id: object::new(ctx), pledge_id, principal, original_borrower: borrower }
}

public(package) fun burn_lender_note(note: LenderNote): ID {
    let LenderNote { id, pledge_id, .. } = note;
    id.delete();
    pledge_id
}

public(package) fun burn_borrower_note(note: BorrowerNote): ID {
    let BorrowerNote { id, pledge_id, .. } = note;
    id.delete();
    pledge_id
}

public fun lender_note_pledge(note: &LenderNote): ID { note.pledge_id }
public fun lender_note_id(note: &LenderNote): ID { object::id(note) }
public fun borrower_note_pledge(note: &BorrowerNote): ID { note.pledge_id }
public fun borrower_note_id(note: &BorrowerNote): ID { object::id(note) }
public fun lender_note_principal(note: &LenderNote): u64 { note.principal }
public fun lender_note_apr_bps(note: &LenderNote): u16 { note.apr_bps }
public fun lender_note_started_at(note: &LenderNote): u64 { note.started_at_ms }
public fun lender_note_matures_at(note: &LenderNote): u64 { note.matures_at_ms }
```

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test notes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/notes.move packages/move/tests/notes_tests.move
git commit -m "feat(move): mint and burn the lender and borrower notes"
```

### Task 5: pledge::accept originates the loan in one signature

**Files:**
- Modify: `packages/move/sources/pledge.move`, `packages/move/sources/config.move` (add `fee_recipient`), `packages/move/sources/escrow.move` (add `into_principal`)
- Test: `packages/move/tests/pledge_tests.move`

**Interfaces:**
- Consumes: `Pledge<T>` (shared), `FundsHold<T>` (shared, by value), `Config` (shared, `origination_fee_bps`, `max_annual_percentage_rate_bps`, `max_loan_to_value_bps`, `grace_period_ms`, `fee_recipient`), `&Clock`.
- Produces: `pledge::accept<T>(&mut Pledge<T>, hold: FundsHold<T>, &Config, term_ms: u64, &Clock, ctx)`. It splits the origination fee to `fee_recipient`, sends the rest to the borrower, mints the `LenderNote` to `hold.owner` and the `BorrowerNote` to `pledge.borrower`, and sets the pledge ACTIVE. Adds `escrow::into_principal<T>(FundsHold<T>): (Balance<T>, vector<u8>, address)` returning the funds, hold key, and lender.

- [ ] **Step 1: Write the failing test**

```move
#[test]
fun accept_disburses_principal_and_mints_both_notes() {
    // borrower opens, lender makes an offer against this pledge id, borrower accepts.
    // assert: borrower holds a Coin<USDC> of principal minus fee; fee_recipient holds the fee;
    // LENDER holds a LenderNote; BORROWER holds a BorrowerNote; pledge.is_active().
}

#[test, expected_failure(abort_code = pledge::ERateTooHigh)]
fun accept_rejects_an_apr_over_the_cap() { ... }

#[test, expected_failure(abort_code = pledge::EWrongPledge)]
fun accept_rejects_a_hold_for_another_pledge() { ... }
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test accept_disburses`
Expected: FAIL.

- [ ] **Step 3: Implement accept**

Add `fee_recipient: address` to `Config`, set it to the publisher in `config::publish`, expose `config::fee_recipient(&Config): address`. Then in `pledge`:

```move
const EWrongPledge: u64 = 2;
const ERateTooHigh: u64 = 3;

public fun accept<T>(
    pledge: &mut Pledge<T>,
    hold: FundsHold<T>,
    config: &Config,
    term_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pledge.status == OPEN, ENotOpen);
    assert!(pledge.borrower == ctx.sender(), ENotBorrower);
    assert!(escrow::hold_pledge_id(&hold) == object::id(pledge), EWrongPledge);
    let params = config.parameters();
    assert!(pledge.requested_apr_bps <= params.max_annual_percentage_rate_bps(), ERateTooHigh);

    let (funds, hold_key, lender) = escrow::into_principal(hold);
    let principal = funds.value();
    let now = clock.timestamp_ms();
    let fee = mul_bps(principal, params.origination_fee_bps());
    let mut coin = coin::from_balance(funds, ctx);
    if (fee > 0) transfer::public_transfer(coin.split(fee, ctx), config.fee_recipient());
    transfer::public_transfer(coin, pledge.borrower);

    let lender_note = notes::mint_lender_note(object::id(pledge), principal, pledge.requested_apr_bps, now, now + term_ms, lender, ctx);
    let borrower_note = notes::mint_borrower_note(object::id(pledge), principal, pledge.borrower, ctx);
    pledge.lender_note_id = option::some(notes::lender_note_id(&lender_note));
    pledge.borrower_note_id = option::some(notes::borrower_note_id(&borrower_note));
    pledge.status = ACTIVE;
    pledge.accepted_hold_key = hold_key;
    pledge.principal = principal;
    pledge.apr_bps = pledge.requested_apr_bps;
    pledge.started_at_ms = now;
    pledge.matures_at_ms = now + term_ms;
    pledge.grace_period_ms = params.grace_period_ms();

    event::emit(LoanOriginated { pledge_id: object::id(pledge), borrower: pledge.borrower, lender, principal, matures_at_ms: now + term_ms });
    transfer::public_transfer(lender_note, lender);
    transfer::public_transfer(borrower_note, pledge.borrower);
}
```

Add `mul_bps` (multiply then divide by 10000 in `u128`, truncating) as a private helper, or reuse one from `interest` if it exposes it. Add the `LoanOriginated` event. Add the `LTV` check against `max_loan_to_value_bps` indexed by the receipt's `item_category` if the borrowed principal versus appraised value is to be enforced on chain; if the API already gates LTV, record that decision in a comment and skip the on-chain check to keep acceptance from needing the appraisal in a second place.

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test pledge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/pledge.move packages/move/sources/config.move packages/move/sources/escrow.move packages/move/tests/pledge_tests.move
git commit -m "feat(move): accept an offer and originate the loan in one signature"
```

---

## Slice p12e: repay, collect, default

### Task 6: The three settlement transitions

**Files:**
- Modify: `packages/move/sources/pledge.move`
- Test: `packages/move/tests/pledge_tests.move`

**Interfaces:**
- Consumes: `notes::BorrowerNote`/`LenderNote` (owned, by value), `Coin<T>`, `&Clock`, `interest::amount_due`.
- Produces: `pledge::repay<T>(&mut Pledge<T>, BorrowerNote, payment: Coin<T>, &Clock, ctx)`, `pledge::collect<T>(Pledge<T>, LenderNote, ctx)`, `pledge::claim_default<T>(&mut Pledge<T>, LenderNote, &Clock, ctx)`.

- [ ] **Step 1: Write the failing tests**

```move
#[test]
fun repay_before_the_cliff_returns_the_receipt_and_parks_the_payoff() { ... assert BORROWER holds the receipt; pledge REPAID; parked == amount due ... }

#[test]
fun collect_pays_the_current_note_holder() {
    // originate, transfer the LenderNote to SECOND_LENDER, repay, then SECOND_LENDER collects
    // assert SECOND_LENDER holds a Coin<USDC> of the payoff, not the original lender
}

#[test, expected_failure(abort_code = pledge::EPastGrace)]
fun repay_after_the_cliff_aborts() { ... advance clock past matures + grace ... }

#[test]
fun claim_after_the_cliff_hands_the_receipt_to_the_note_holder() { ... assert LENDER holds the receipt; pledge DEFAULTED ... }

#[test, expected_failure(abort_code = pledge::EBeforeGrace)]
fun claim_before_the_cliff_aborts() { ... }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/move && sui move test repay`
Expected: FAIL.

- [ ] **Step 3: Implement the three transitions**

```move
const EPastGrace: u64 = 4;
const EBeforeGrace: u64 = 5;
const ENotRepaid: u64 = 6;
const EInsufficientPayment: u64 = 7;
const EWrongNote: u64 = 8;

public fun repay<T>(pledge: &mut Pledge<T>, note: BorrowerNote, payment: Coin<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(pledge.status == ACTIVE, ENotOpen);
    assert!(notes::borrower_note_pledge(&note) == object::id(pledge), EWrongNote);
    let now = clock.timestamp_ms();
    assert!(now < pledge.matures_at_ms + pledge.grace_period_ms, EPastGrace);
    let due = interest::amount_due(pledge.principal, pledge.apr_bps, pledge.started_at_ms, pledge.matures_at_ms, now);
    assert!(payment.value() >= due, EInsufficientPayment);
    pledge.parked.join(payment.into_balance());
    notes::burn_borrower_note(note);
    pledge.status = REPAID;
    let item = pledge.receipt.extract();
    event::emit(LoanRepaid { pledge_id: object::id(pledge), amount: due });
    transfer::public_transfer(item, ctx.sender());
}

public fun collect<T>(pledge: Pledge<T>, note: LenderNote, ctx: &mut TxContext) {
    assert!(pledge.status == REPAID, ENotRepaid);
    assert!(notes::lender_note_pledge(&note) == object::id(&pledge), EWrongNote);
    notes::burn_lender_note(note);
    let Pledge { id, mut receipt, parked, .. } = pledge;
    receipt.destroy_none();
    let pledge_id = id.to_inner();
    let amount = parked.value();
    event::emit(LoanSettled { pledge_id, amount });
    transfer::public_transfer(coin::from_balance(parked, ctx), ctx.sender());
    id.delete();
}

public fun claim_default<T>(pledge: &mut Pledge<T>, note: LenderNote, clock: &Clock, ctx: &mut TxContext) {
    assert!(pledge.status == ACTIVE, ENotOpen);
    assert!(notes::lender_note_pledge(&note) == object::id(pledge), EWrongNote);
    assert!(clock.timestamp_ms() >= pledge.matures_at_ms + pledge.grace_period_ms, EBeforeGrace);
    notes::burn_lender_note(note);
    pledge.status = DEFAULTED;
    let item = pledge.receipt.extract();
    event::emit(CollateralClaimed { pledge_id: object::id(pledge), claimant: ctx.sender() });
    transfer::public_transfer(item, ctx.sender());
}
```

Add `use depawn::interest;`, `use depawn::notes::{Self, LenderNote, BorrowerNote};`, `use sui::coin;`, and the three events. After `collect` and `claim_default` the pledge either is deleted (collect) or is left DEFAULTED with an empty receipt option and a zero parked balance; add a `close_defaulted` cleanup only if a later reconciliation needs the object gone, otherwise leave DEFAULTED as the terminal readable record.

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test pledge`
Expected: PASS, all five.

- [ ] **Step 5: Commit**

```bash
git add packages/move/sources/pledge.move packages/move/tests/pledge_tests.move
git commit -m "feat(move): repay, collect, and claim a defaulted pledge"
```

---

## Slice p12f: the secondary market

### Task 7: Atomic position swap

**Files:**
- Create: `packages/move/sources/market.move`
- Test: `packages/move/tests/market_tests.move`

**Interfaces:**
- Consumes: `notes::LenderNote` (owned, by value), `Coin<T>`.
- Produces: `market::list_position<T>(note: LenderNote, ask: u64, ctx)` shares a `PositionListing<T>`. `market::buy_position<T>(PositionListing<T>, payment: Coin<T>, ctx)` sends the note to the buyer and the coin to the seller. `market::delist_position<T>(PositionListing<T>, ctx)` returns the note to the seller.

- [ ] **Step 1: Write the failing test**

```move
#[test]
fun buy_position_swaps_the_note_for_the_coin() {
    // SELLER lists a LenderNote with ask 410_000; BUYER buys with a 410_000 coin
    // assert BUYER holds the LenderNote; SELLER holds a Coin<USDC> of 410_000; listing consumed
}

#[test, expected_failure(abort_code = market::EBelowAsk)]
fun buy_position_rejects_underpayment() { ... 409_999 ... }

#[test]
fun delist_returns_the_note_to_the_seller() { ... }
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/move && sui move test market`
Expected: FAIL, module `market` does not exist.

- [ ] **Step 3: Write the module**

```move
module depawn::market;

use depawn::notes::LenderNote;
use sui::coin::Coin;

const EBelowAsk: u64 = 0;
const ENotSeller: u64 = 1;

public struct PositionListing<phantom T> has key {
    id: UID,
    seller: address,
    ask: u64,
    note: Option<LenderNote>,
}

public struct PositionListed has copy, drop { listing_id: ID, seller: address, note_id: ID, ask: u64 }
public struct PositionSold has copy, drop { listing_id: ID, seller: address, buyer: address, note_id: ID, price: u64 }

public fun list_position<T>(note: LenderNote, ask: u64, ctx: &mut TxContext) {
    let listing = PositionListing<T> { id: object::new(ctx), seller: ctx.sender(), ask, note: option::some(note) };
    let held = listing.note.borrow();
    event::emit(PositionListed { listing_id: object::id(&listing), seller: listing.seller, note_id: object::id(held), ask });
    transfer::share_object(listing);
}

public fun buy_position<T>(listing: PositionListing<T>, payment: Coin<T>, ctx: &mut TxContext) {
    assert!(payment.value() >= listing.ask, EBelowAsk);
    let PositionListing { id, seller, ask, mut note } = listing;
    let item = note.extract();
    note.destroy_none();
    let listing_id = id.to_inner();
    let buyer = ctx.sender();
    let note_id = object::id(&item);
    event::emit(PositionSold { listing_id, seller, buyer, note_id, price: ask });
    transfer::public_transfer(item, buyer);
    transfer::public_transfer(payment, seller);
    id.delete();
}

public fun delist_position<T>(listing: PositionListing<T>, ctx: &mut TxContext) {
    assert!(listing.seller == ctx.sender(), ENotSeller);
    let PositionListing { id, seller, note: mut opt, .. } = listing;
    let item = opt.extract();
    opt.destroy_none();
    id.delete();
    transfer::public_transfer(item, seller);
}
```

Add `use sui::event;`. The buyer's overpayment above the ask stays with the seller; if change is wanted, split in the caller before buying. Record that choice in a comment.

- [ ] **Step 4: Run the tests to pass**

Run: `cd packages/move && sui move test market`
Expected: PASS.

- [ ] **Step 5: Commit and republish check**

```bash
git add packages/move/sources/market.move packages/move/tests/market_tests.move
git commit -m "feat(marketplace): swap a lender note for usdc atomically"
cd packages/move && sui move build
```

Expected: the whole package builds; `sui move test` is green across all modules.

---

## Slice p12g: the API and the frontend

This slice inverts the API from co-writing the database to building transactions the member's wallet signs. Its exact edit points depend on the p12a-f modules existing and on the current `apps/api` chain wiring, so each task below names its deliverable and its test; the file-level detail is read against the p12f tree at execution time. If p12g grows past what one plan holds, split it into its own plan following writing-plans, one task per endpoint.

### Task 8: Pure PTB builders for every member action

**Files:**
- Create: `apps/api/src/infrastructure/chain/ptb/pledge-calls.ts`, `notes-calls.ts`, `market-calls.ts`
- Modify: `apps/api/src/infrastructure/chain/ptb/custody-calls.ts`, `escrow-calls.ts`
- Test: `apps/api/src/infrastructure/chain/ptb/builders.spec.ts`

**Interfaces:**
- Produces: pure functions `buildOpenPledge`, `buildCancelPledge`, `buildMakeOffer`, `buildRefundLosing`, `buildRefundExpired`, `buildAccept`, `buildRepay`, `buildCollect`, `buildClaimDefault`, `buildListPosition`, `buildBuyPosition`, each taking the deployment ids, the coin type, and the call arguments, and appending commands to a `Transaction`. No signing.

- [ ] **Step 1:** Write a builder unit test asserting `buildAccept` serialises to a `moveCall` targeting `pledge::accept` with the pledge object, the hold object, the config object, and the clock as inputs.
- [ ] **Step 2:** Run it, expect FAIL (function missing).
- [ ] **Step 3:** Implement the builders, mirroring the existing `escrow-calls.ts` shape (deployment-typed target strings, `tx.object(...)`, `tx.pure...`).
- [ ] **Step 4:** Run the builder suite, expect PASS.
- [ ] **Step 5:** Commit `feat(api): build the self-custody transactions`.

### Task 9: Endpoints that return an unsigned transaction

**Files:**
- Modify: the marketplace and lending controllers and their use cases under `apps/api/src`
- Test: an integration test per endpoint under the api test tree

**Interfaces:**
- Produces: for each member action, a `POST` that validates the request against the current read models, builds the transaction with the Task 8 builders, and returns the serialised transaction bytes plus the object ids the client will need. Intake keeps its operator-signed path with `CustodianCap`.

- [ ] **Step 1:** Write an integration test that posts an accept request and asserts the response carries transaction bytes referencing the offer and the pledge, and that an invalid request (offer for another pledge) is rejected before any transaction is built.
- [ ] **Step 2:** Run it, expect FAIL.
- [ ] **Step 3:** Implement the endpoint and its precondition checks against the projections.
- [ ] **Step 4:** Run the test, expect PASS.
- [ ] **Step 5:** Commit `feat(api): return unsigned self-custody transactions`.

### Task 10: The indexer projects the new objects and events

**Files:**
- Modify: `apps/api/src/infrastructure/chain/indexer/*`
- Test: the indexer test tree

**Interfaces:**
- Produces: projections from `ListingOpened`, `LoanOriginated`, `LoanRepaid`, `LoanSettled`, `CollateralClaimed`, `PositionListed`, `PositionSold` into the listing, loan, and note read models, keyed idempotently by digest and event index.

- [ ] **Step 1:** Write a replay test that feeds the seven events and asserts the read models match.
- [ ] **Step 2:** Run it, expect FAIL.
- [ ] **Step 3:** Implement the projections.
- [ ] **Step 4:** Run it, expect PASS.
- [ ] **Step 5:** Commit `feat(indexer): project the self-custody lifecycle`.

### Task 11: The marketplace signs with the connected wallet

**Files:**
- Modify: `apps/marketplace/src` list, offer, accept, repay, and portfolio screens; reuse `apps/marketplace/src/wallet`
- Test: `e2e/tests/marketplace.self-custody.spec.ts`, extending `wallet.config.ts`

**Interfaces:**
- Consumes: the Task 9 endpoints and dapp-kit `useSignAndExecuteTransaction`.
- Produces: each action fetches the unsigned transaction, has the connected wallet sign and execute it, and shows an optimistic pending state keyed on the returned digest until the indexer confirms (Q-035).

- [ ] **Step 1:** Write a wallet-signed Playwright path: the test wallet lists an item, a second test wallet offers, the first accepts, then repays, asserting the portfolio shows the loan settled.
- [ ] **Step 2:** Run it against `pnpm test:e2e:wallet`, expect FAIL.
- [ ] **Step 3:** Wire the screens to the endpoints and the wallet, add the pending state.
- [ ] **Step 4:** Run the E2E, expect PASS.
- [ ] **Step 5:** Commit `feat(marketplace-ui): sign self-custody actions with the wallet`.

---

## Self-Review

- **Spec coverage:** every object (`VaultReceipt`, `Pledge`, `FundsHold`, `LenderNote`, `BorrowerNote`, `PositionListing`) and every flow (intake, redeem, list, offer, cancel, accept, losing refund, repay, collect, default, secondary market) maps to a task. Intake stays in the existing custody path; redeem is Task 1; the rest are Tasks 2 to 11.
- **Single-sender check:** every loan and market function takes only shared objects and the signer's owned objects. No capability appears on the loan or market path. Confirmed against each signature above.
- **Module graph:** `escrow` does not depend on `pledge`; the loser-refund guard is passed in by the caller. `pledge` depends on `escrow`, `notes`, `custody`, `interest`, `config`. `market` depends only on `notes`. Acyclic.
- **Type consistency:** the `Pledge<T>` phantom type flows through `open`, `accept`, `repay`, `collect`, `claim_default`; `FundsHold<T>` and the coin type match at `accept`. Note ids are `ID`, stored as `Option<ID>` on the pledge and returned by the burns.
- **Deferred detail:** p12g file paths are read at execution time by design, because they depend on modules that do not exist yet. Every p12g task still names a concrete deliverable and a test.
