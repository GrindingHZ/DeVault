# The loan book moves onto Sui

Status: designed, ready to plan
Phase: P9 to P11
Follows: `docs/08-web3-migration.md`, `docs/07-phase-plan.md`

## Why

The Web2 product is complete. Every flow in `docs/10-flows.md` runs end to end against Postgres,
and every one of them reaches money and custody through two interfaces the domain owns:
`SettlementPort` and `CustodyPort`. `docs/08-web3-migration.md` promised that the pivot to Sui is
four adapters and an indexer, and that nothing in the domain changes.

This document is the P9 audit the phase plan demands before any Move is written, and the design
that follows from it. The audit result is the load bearing sentence:

**The seam covers money and title. It does not cover the market.**

Every use case that moves value calls the settlement port. Every use case that moves an item calls
the custody port. Publishing a listing, marking a default, scheduling a sale, and reassigning a
note holder call neither: they write rows through repositories and announce themselves through
domain events. The Move contract set sketched in `docs/08` and in the refresher that started this
work has `Listing`, `Loan`, `LenderNote` and `Liquidation` as shared objects with their own entry
functions. No port reaches those objects, so no adapter can create them without a new port per use
case, which is a rewrite of the application layer under another name. That is the fifth thing
`docs/08` said to treat as a leak, and the leak is on the documentation's side rather than the
code's.

So the chain enforces what the ports reach, which is the part a pawnbroker actually has to prove:
that money moved exactly as promised and that title to an item is where the book says it is. The
market's state machines keep running in the application layer, and every one of their transitions
is attested on chain inside the same transaction as the settlement it belongs to. The result is a
custodial loan book with a public, atomic, independently verifiable settlement rail, which is what
`CLAUDE.md` calls a pawnbroker on modern rails and not a trustless protocol.

## What goes on chain

| Concern | On chain | Enforced by |
|---|---|---|
| Available balances | `Wallet<T>` shared object per account and currency | Move: only the owner's address can receive a withdrawal |
| Held funds | `FundsHold<T>` shared object per hold | Move: a hold refunds only to its owner's wallet, and releases only through a payout that must be emptied |
| Settlement waterfall | `Payout<T>` hot potato paid out in order | The compiler: a payout with funds left cannot be dropped |
| Custody receipts | `VaultReceipt` shared object with a holder and a status | Move: every transition is a function that checks the status it leaves |
| Pause | `paused` on the shared `Config` | Move: a new hold aborts while paused, a refund or release never does |
| Parameters | mirrored onto `Config` | Read only on chain, written by `AdminCap` |
| Every domain event | `DomainEventAttested` in the settling transaction | The same transaction that moves the money records why |
| Interest arithmetic | `interest::accrued` | Tested against the same fixtures as the TypeScript |

What stays in Postgres: the listing, offer, loan, note, note sale, liquidation and redemption
aggregates, the read models, the audit log, the outbox, and the ledger, which becomes the mirror
`docs/03-ledger-and-money.md` always said it would become.

What is deferred, recorded in `docs/OPEN-QUESTIONS.md`: market state machines as Move objects
(needs a market port and touches every use case), members signing their own transactions (needs
per use case entry points authorised by the acting address), and one custodian capability per
vault.

## The package

One package, `packages/move`, named `depawn`, Move 2024 edition. Modules:

### config

```
AdminCap has key, store          parameters and pause, a multisig later
OperatorCap has key, store       day to day settlement: holds, releases, wallets, attestations
CustodianCap has key, store      custody: issue, move and burn receipts
Config has key, shared           paused: bool, parameters: Parameters
Parameters has copy, drop, store
    max_loan_to_value_bps: vector<u16>   indexed by item category code
    max_annual_percentage_rate_bps: u16
    minimum_offer_lifetime_ms: u64
    origination_fee_bps: u16
    liquidation_fee_bps: u16
    grace_period_ms: u64
    statutory_holding_period_ms: u64
    notes_transferable: bool
    effective_at_ms: u64
```

`init` mints the three capabilities to the publisher and shares `Config` with the demo defaults
from `demo-parameters.ts`. `pause` and `unpause` take `&AdminCap` and the clock and emit
`SystemPaused` and `SystemUnpaused`. `set_parameters` takes `&AdminCap` and emits
`ParametersUpdated`. `assert_not_paused` is called by `escrow::hold` and by nothing else, which is
rule S2 written as a call graph.

The three capabilities are the three rows of the "who signs what" table in `docs/08`. The demo
hands all three to the operator key. Splitting them across keys later is a transfer, not an
upgrade.

### custody

```
VaultReceipt has key, shared
    receipt_key: vector<u8>       the domain receipt id, so events name what the api names
    vault: vector<u8>
    holder: address
    intake_hash: vector<u8>
    appraised_value: u64
    appraised_at_ms: u64
    item_category: u8
    insurance_reference: vector<u8>
    status: u8                    IN_VAULT or ENCUMBERED
    encumbered_by: vector<u8>     the loan key while ENCUMBERED, empty otherwise
```

Every mutation takes `&CustodianCap`. The vault is the custodian of record for every item it holds,
and the chain carries its attestation of title: who holds the paper, whether a loan has it pledged,
and when it was spent.

| Function | From, to | Event |
|---|---|---|
| `issue` | creates IN_VAULT under the holder | `ReceiptIssued` |
| `transfer_holder` | IN_VAULT, holder changes | `ReceiptTransferred` |
| `encumber` | IN_VAULT to ENCUMBERED | `ReceiptEncumbered` |
| `release_encumbrance` | ENCUMBERED to IN_VAULT | `EncumbranceReleased` |
| `claim` | ENCUMBERED to IN_VAULT under the claimant | `ReceiptClaimedByLender` |
| `burn_for_redemption` | IN_VAULT, object deleted | `RedemptionRequested` |
| `burn_for_liquidation` | either live state, object deleted | `ReceiptLiquidated` |
| `reissue_to_buyer` | deletes the old object, shares a new one under the buyer | `ReceiptLiquidated`, `ReceiptIssued` |

The receipt is shared rather than owned, with a `holder` field, for one reason that decides the
whole module: a liquidation can run after a lender has claimed the item, and an operator cannot take
an object another address owns. A shared object with a custodian capability reproduces the Phase 1
table exactly, including that transition. Terminal states delete the object; the events are the
history, and reconciliation counts live receipts as live objects.

### escrow

The settlement port, as objects.

```
Wallet<phantom T> has key, shared        owner: address, funds: Balance<T>
FundsHold<phantom T> has key, shared     hold_key, owner, funds: Balance<T>, reference
Payout<phantom T>                        hot potato: funds: Balance<T>, hold_key, reason
```

| Function | Authority | What it does |
|---|---|---|
| `open_wallet` | `&OperatorCap` | shares an empty wallet for an owner |
| `deposit` | anyone | moves a coin into a wallet, `FundsDeposited` |
| `withdraw` | `&OperatorCap` | sends a coin to `wallet.owner` and to nobody else, `FundsWithdrawn` |
| `hold` | `&OperatorCap`, not paused | splits the wallet into a new shared hold, `FundsHeld` |
| `refund_hold` | `&OperatorCap` | deletes the hold, joins its funds back into the owner's wallet, `HoldRefunded` |
| `begin_release` | `&OperatorCap` | deletes the hold and returns its funds as a `Payout`, `HoldReleased` |
| `pay` | holds the payout | moves an amount into a recipient wallet, `Paid` |
| `pay_new` | `&OperatorCap`, holds the payout | the same, for a recipient with no wallet yet |
| `finish_release` | holds the payout | aborts unless the payout is empty, then destroys it |
| `transfer` | `&OperatorCap` | wallet to wallet with a reason, `FundsTransferred` |

`Payout` has no abilities. A transaction that calls `begin_release` and does not call
`finish_release` on the result does not compile, and `finish_release` aborts on a non zero
balance. That is the ledger's balance invariant with the compiler as the trigger: the whole of a
hold goes to the recipients, in order, or the transaction fails.

The Phase 1 chart of accounts maps directly: `USER_AVAILABLE` is the wallet, `USER_HELD` is the
hold, `PLATFORM_FEE_REVENUE` and `PLATFORM_ROUNDING` are the operator's wallet, and
`PLATFORM_FLOAT` is the treasury capability of the settlement coin. A deposit mints, a withdrawal
sends real coins to the owner's own address.

### attestation

`attest(&OperatorCap, subject_type, subject_id, event_type, payload, &Clock)` emits
`DomainEventAttested`. The chain event publisher calls it once per domain event, inside the
transaction that performs the settlement the event describes. A settlement reference inside a
payload is written as `self`, because the digest of a transaction cannot appear in its own events.

### interest

`accrued(principal, apr_bps, started_at_ms, matures_at_ms, now_ms): u64` and `amount_due`. The
elapsed time is clamped at maturity and never negative, the product is taken in `u128`, and the
division truncates in the borrower's favour, all three matching `interest-calculator.ts` line for
line. Its tests are generated from the fixture file the TypeScript tests read, so the two cannot
disagree quietly.

### usd

A two decimal test coin, `Coin<USD>`, whose `TreasuryCap` is the platform float. The escrow module
is generic over `T`; the deployment names which coin type stands for the api's `USD`. On a public
network this is a real stablecoin type and the mint path is an on ramp.

## The execution model

**One unit of work is one programmable transaction.** `SuiUnitOfWork.run` opens the Prisma
transaction as today, hands the use case a context that carries both the Prisma transaction and a
`Transaction` builder, lets the use case run, and then, if any port appended a command, signs and
executes the block before the database transaction commits. A failed execution throws and rolls
the database back. A successful one resolves the references and commits.

**References resolve at commit.** A port cannot return the digest of a transaction that has not
been built yet, so the chain adapters return a `ChainSettlementRef` whose `reference` reads as
`pending:<n>` until the unit of work resolves it. The object stays the same object, so a `Loan`
that stored it before the commit reads the digest after. Rows written in the meantime, the loan's
origination reference, the outbox payloads and the audit entries, are patched inside the same
database transaction from a short, tested list of columns, and an integration test asserts that no
`pending:` token survives any chain use case.

**One signer.** Every command the ports append is authorised by a capability, so the operator key
is the sender of every transaction and members hold no keys in this phase. Gas is the operator's
concern and submissions serialise through the SDK's `SerialTransactionExecutor`, which is the
equivocation guard `docs/08` asks for.

**Failures are values.** The submitter checks `result.$kind === 'FailedTransaction'` and maps a
Move abort by module and code onto the domain error the ledger adapter would have thrown:
`escrow::EInsufficientFunds` is `INSUFFICIENT_FUNDS`, `config::EPaused` is `SYSTEM_PAUSED`, and the
custody codes are the receipt errors. The adapters also pre check against their projections so the
common case fails before anything is built; the chain abort is the atomic backstop.

## The adapters

**`SuiSettlementAdapter`** wraps `LedgerSettlementAdapter`. Every call records the mirror ledger
entries first, which is what keeps the wallet screen, `toSumToZero`, and the reconciliation basis
working, then appends the chain call and returns the chain reference. `availableBalance` reads the
wallet object on chain, because the chain is authoritative. Two tables carry the mapping:
`chain_funds_hold` (hold id to object id and status, for idempotent refunds and releases) and
`chain_settlement` (digest to ledger kind, for the contract suite's `transactionKindOf`).

**`SuiCustodyAdapter`** wraps `DatabaseCustodyAdapter` the same way: the receipt row is the
projection the read models already use, the object is the truth, `chain_receipt` maps one to the
other.

**`SuiSystemStateAdapter`** pauses the chain `Config` beside the database row, in one unit of
work. Reads stay on the row; reconciliation compares.

**`SuiProtocolParametersAdapter`** mirrors a version onto `Config` when it is written with an
effective instant at or before now. A future dated version is recorded as an open question.

**`SuiDomainEventPublisher`** writes the outbox as today and appends one `attest` per event.

**Identity.** `AccountId` maps to an address through `chain_account_address`, derived from a
master seed and the account id on first use. Members do not sign in this phase; the address is
where a withdrawal lands and what a wallet names as its owner. The platform sentinels in
`platform-accounts.ts` map to the operator's address.

## Deployment and drivers

`SETTLEMENT_DRIVER=ledger|chain` and `CUSTODY_DRIVER=database|chain`, as `docs/07` P9 asks. Either
switch on the chain driver selects `SuiUnitOfWork`; the Prisma adapters keep working through it
because the chain context carries the Prisma transaction. A chain driver with no deployment fails
at boot with the deployment it is missing, not somewhere inside a use case.

`scripts/chain-publish.ts` builds the package, publishes it with the operator key, reads the
created objects out of the effects, and writes one row to `chain_deployment`: package id, config
id, the three capability ids, the treasury capability, the coin type. On localnet it funds the
operator from the faucet first. `docker compose` gains a `sui` service running a localnet with a
faucet, and the api entrypoint publishes on first boot when the chain driver is on.

## The indexer and reconciliation

`ChainEventIndexer` polls `listEvents` per module of the package with a cursor stored in
`chain_indexer_cursor`, and inserts each event into `chain_event` keyed by transaction digest and
position, in one database transaction per page. A duplicate is a no-op through the unique key, a
restart resumes from the cursor, and the replay test empties the table, resets the cursor, and
proves the same rows come back.

`ChainReconciliation` diffs the projection against the chain: every HELD row in `chain_funds_hold`
against an existing hold object with the same amount, every live receipt row against a live
receipt object with the same holder and status, every wallet against the mirror ledger's available
balance, and the database pause flag against `Config.paused`. Drift is returned as rows naming the
subject, the field, and both values.

## Tests

- Move: `sui move test`, one test per `assert!`, `#[expected_failure(abort_code = ...)]` for every
  rejection, `test_scenario` for anything crossing a transaction boundary, and the generated
  interest fixture tests.
- Builders: pure functions from input to `Transaction`, asserted on their serialised commands.
- Unit of work: a fake submitter proves pending references resolve, failures roll back, and a unit
  of work without chain commands never submits.
- Port contracts: `describeSettlementPortContract('sui', ...)` and
  `describeCustodyPortContract('sui', ...)` against a localnet, publishing the package fresh per
  suite. The suites skip with a named reason when no localnet is reachable.
- Lifecycle: origination, repayment, default and claim, liquidation with a surplus, each on the
  chain driver, each asserting the ledger mirror sums to zero and every reference resolves on
  chain.
- Pause: holds abort on chain while paused; refunds, releases and claims do not.
- Indexer: duplicate, restart, replay. Reconciliation: a corrupted projection row is reported.
- CI starts a localnet for the chain suites.

## Frontend

`packages/ui` gains `SettlementReference`, which renders a `chain` reference as an explorer link
on a public network and as a copyable digest on a local one. The loan detail and the admin deposit
screen use it. The health endpoint reports the chain network so the client knows which explorer.
Nothing else in the three applications changes, which is the promise `docs/08` made.

## Slices

1. `p9a-chain-readiness`: the driver switches, the stub adapters that fail at the boundary, the
   shared fixture file, the package scaffold, the SDK dependency and the module resolution it needs.
2. `p10a-move-package`: the modules above with their tests.
3. `p10b-chain-client`: configuration, deployment registry, the publish script, addresses and
   wallets, builders, the unit of work.
4. `p10c-sui-settlement`: the settlement adapter and its contract suite on localnet.
5. `p10d-sui-custody`: the custody adapter and its contract suite.
6. `p10e-config-events-lifecycle`: pause, parameters, attestation, the wiring, the lifecycle tests.
7. `p10f-indexer`: the indexer and reconciliation.
8. `p11a-chain-demo`: the settlement reference component, health, compose, CI, documentation.

## Open questions raised

- Whether the market's state machines should become Move objects, which needs a market port.
- Whether members should sign their own settlement transactions, and how gas is paid if so.
- One custodian capability per vault, versus one for the operator.
- Future dated parameter versions and the chain mirror.
- Which explorer to link for each network.
