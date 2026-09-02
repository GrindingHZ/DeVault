# The loan book on Sui: implementation plan

> For agentic workers: execute this plan slice by slice through the loop in
> `docs/11-execution-pipeline.md`. Each slice gets its own `.claude/work/<slice>/plan.md` copied
> from the task list below, one commit per task, `pnpm check` and the unit suite green before every
> commit. Move tasks additionally run `pnpm move:test`.

**Goal:** money and title settle on Sui behind the two ports the domain already owns, with the
Move package, the adapters, the indexer, and the demo wiring described in the spec.

**Architecture:** a Move package of six modules (`config`, `custody`, `escrow`, `attestation`,
`interest`, `usd`); a chain unit of work that turns one use case into one programmable
transaction executed before the database commit; two adapters that wrap the Phase 1 adapters as
projections and append the chain calls; a polling indexer with a durable cursor; a reconciliation
that diffs projection against chain.

**Tech stack:** Sui 1.77 CLI, Move 2024, `@mysten/sui` 2.26 (gRPC client, ESM only, needs
`nodenext` resolution and Node 24's `require(esm)`), NestJS, Prisma, Vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-25-web3-migration-design.md`

## Global constraints

- Nothing under `apps/api/src/domain` changes except spec files reading fixtures. The boundary
  rule already forbids `@mysten` there; keep it.
- No use case changes. Every chain concern lives in `apps/api/src/infrastructure/chain/` and the
  adapters beside their Phase 1 twins.
- Commit scopes come from `docs/12-writing-and-commits.md`. Chain infrastructure in the api uses
  `api`; the settlement adapter uses `ledger`; the custody adapter uses `custody`; the package uses
  `move`; the indexer uses `indexer`.
- Prose rules apply to Move comments and to every markdown written here.
- Money on chain is `u64` base units of the settlement coin, equal to the api's minor units.
- Every chain integration suite skips, with the reason in the skip message, when
  `SUI_GRPC_URL` (default `http://127.0.0.1:9000`) is unreachable.
- Move abort codes are constants in each module and mirrored one for one in
  `apps/api/src/infrastructure/chain/chain-abort-codes.ts`; a unit test reads the Move sources and
  asserts the mirror matches.

---

## Slice p9a-chain-readiness

Exit: flipping either driver to `chain` produces one clear failure at the port boundary; the
fixture file is the single source for interest and waterfall test data; the package scaffold
builds; the api resolves the SDK.

### Task 1: `chore(config): add settlement and custody driver switches`

Files: modify `apps/api/src/config/configuration.ts`; create
`apps/api/src/config/configuration.spec.ts`.

`Configuration` gains `settlementDriver: 'ledger' | 'chain'` and `custodyDriver: 'database' |
'chain'`, read from `SETTLEMENT_DRIVER` and `CUSTODY_DRIVER`, defaulting to the Phase 1 values. An
unknown value throws at load with the variable name in the message. Export
`isChainDriverEnabled(configuration): boolean`, true when either is `chain`.

Test: defaults when unset, each value parsed, an unknown value throws naming the variable.

### Task 2: `feat(ledger): refuse chain settlement until the adapter exists`

Files: create `apps/api/src/infrastructure/chain/chain-driver-not-ready.ts` (an `Error` subclass
`ChainDriverNotReady` naming the port and the driver); create
`apps/api/src/infrastructure/settlement/sui-settlement.adapter.ts` implementing `SettlementPort`
with every method throwing `ChainDriverNotReady('SettlementPort')`; modify
`apps/api/src/infrastructure/settlement/settlement.module.ts` so `SETTLEMENT_PORT` is provided by a
factory choosing the adapter from `loadConfiguration().settlementDriver`.

### Task 3: `feat(custody): refuse chain custody until the adapter exists`

The same shape for `sui-custody.adapter.ts` and `custody.module.ts`.

### Task 4: `test(api): flipping a driver to chain fails at the port and nowhere else`

Files: create `apps/api/test/chain-driver-switch.integration.spec.ts`.

Sets `SETTLEMENT_DRIVER=chain` before `createTestApplication`, restores it after. Creating a
listing (no settlement call) succeeds. Placing an offer fails, and the failure is
`ChainDriverNotReady` observed by resolving `SETTLEMENT_PORT` from the app and calling `hold`
directly, plus a 500 through HTTP. Asserts the database has no offer row afterwards.

### Task 5: `test(domain): read interest and waterfall fixtures from a shared file`

Files: create `packages/test-support/src/fixtures/interest.json`,
`packages/test-support/src/fixtures/waterfall.json`, `packages/test-support/src/fixtures.ts`
(typed loaders exported from the package index); modify
`apps/api/src/domain/lending/interest-calculator.spec.ts` and
`apps/api/src/domain/lending/liquidation-waterfall.spec.ts` to add a `describe('shared fixtures')`
that walks every case.

Interest fixture shape, one entry per case, amounts as decimal strings:

```json
{
  "name": "accrues linearly through the term",
  "principalMinorUnits": "250000000",
  "annualPercentageRateBasisPoints": 1800,
  "startedAtMs": "1767225600000",
  "maturesAtMs": "1769817600000",
  "nowMs": "1768521600000",
  "expectedInterestMinorUnits": "1849315068"
}
```

Cases: zero at origination, linear through the term, closed form over a year, clamped at
maturity, nothing before origination, the truncation case, the large principal case. Waterfall
fixture: proceeds, amount owed, fee basis points, expected lender, fee, surplus, remainder; cases
for surplus, loss, exact, and a truncated unit.

### Task 6: `chore(move): scaffold the depawn package`

Files: create `packages/move/Move.toml` (name `depawn`, edition 2024, address `depawn = "0x0"`),
`packages/move/sources/.gitkeep` removed in favour of the first module later,
`packages/move/README.md` (three lines: what it is, `pnpm move:test`, `pnpm move:build`); modify
root `package.json` scripts `move:build` and `move:test` (`sui move build --path packages/move`,
`sui move test --path packages/move`), and `.prettierignore` already excludes the directory.

### Task 7: `chore(deps): add the sui sdk and resolve it the node way`

Files: modify `apps/api/package.json` (dependency `@mysten/sui`), `apps/api/tsconfig.json`
(`module` and `moduleResolution` to `nodenext`), `pnpm-lock.yaml`.

`nodenext` with no `"type": "module"` keeps every file CommonJS, so relative imports stay
extensionless. Node 24 loads the ESM only SDK through `require`. Run the whole `pnpm check` and
both test suites after the switch; fix any resolution errors it surfaces in the same commit.

---

## Slice p10a-move-package

Exit: `pnpm move:test` green, every abort covered by an expected failure test, interest fixtures
generated and agreeing.

### Task 1: `feat(move): a two decimal usd coin for local networks`

File: `packages/move/sources/usd.move`.

```move
module depawn::usd;
public struct USD has drop {}
fun init(witness: USD, ctx: &mut TxContext)   // create_currency(witness, 2, b"USD", ...), treasury to sender, metadata frozen
#[test_only] public fun init_for_testing(ctx: &mut TxContext)
```

### Task 2: `feat(move): config with three capabilities, pause, and parameters`

File: `packages/move/sources/config.move`.

```move
module depawn::config;
const EBadParameters: u64 = 0;
public struct AdminCap has key, store { id: UID }
public struct OperatorCap has key, store { id: UID }
public struct CustodianCap has key, store { id: UID }
public struct Parameters has copy, drop, store {
    max_loan_to_value_bps: vector<u16>, max_annual_percentage_rate_bps: u16,
    minimum_offer_lifetime_ms: u64, origination_fee_bps: u16, liquidation_fee_bps: u16,
    grace_period_ms: u64, statutory_holding_period_ms: u64, notes_transferable: bool,
    effective_at_ms: u64,
}
public struct Config has key { id: UID, paused: bool, paused_at_ms: u64, parameters: Parameters }
public struct SystemPaused has copy, drop { at_ms: u64 }
public struct SystemUnpaused has copy, drop { at_ms: u64 }
public struct ParametersUpdated has copy, drop { parameters: Parameters }
fun init(ctx)                                  // caps to sender, Config shared with demo defaults
public fun new_parameters(...): Parameters     // fees and caps at most 10_000 else EBadParameters
public fun pause(_: &AdminCap, config: &mut Config, clock: &Clock)     // idempotent, emits only on change
public fun unpause(_: &AdminCap, config: &mut Config, clock: &Clock)
public fun set_parameters(_: &AdminCap, config: &mut Config, parameters: Parameters)
public fun assert_not_paused(config: &Config)  // EPaused
public fun is_paused(config: &Config): bool
public fun parameters(config: &Config): &Parameters
#[test_only] public fun init_for_testing(ctx)
```

`EPaused` is code 1. Demo defaults copy `demo-parameters.ts`: LTV `[6000, 5000, 4500, 3500, 3000]`
in category code order, rate cap 4800, lifetime 600000, fees 200 and 200, grace 604800000, holding
2592000000, transferable true.

### Task 3: `test(move): pause and parameters answer to the admin capability`

File: `packages/move/tests/config_tests.move`. Tests: init hands three capabilities to the
publisher and shares a running config; pause sets the flag and stamps the clock; pausing twice
emits once; unpause clears; `assert_not_paused` aborts with `EPaused` while paused; a fee above ten
thousand aborts with `EBadParameters`; `set_parameters` replaces the whole struct.

### Task 4: `feat(move): vault receipts issued and moved by the custodian`

File: `packages/move/sources/custody.move`, the struct, events, and functions in the spec. Abort
codes: `ENotInVault` 0, `ENotEncumbered` 1, `EEmptyKey` 2, `EZeroValue` 3. Category codes 0 to 4 in
the order of `item-category.ts`. `reissue_to_buyer` copies every descriptive field and stamps a new
`issued_at_ms`.

### Task 5: `test(move): every receipt transition and its rejections`

File: `packages/move/tests/custody_tests.move`. Mirrors `custody-receipt.spec.ts`: issue lands in
vault under the holder; encumber binds the loan key; release clears it; claim hands the receipt to
the claimant in vault; transfer refuses while encumbered (`ENotInVault`); encumber refuses twice;
release refuses when not encumbered; burn for redemption refuses while encumbered; burn for
liquidation works from both live states and deletes; reissue deletes the old object and shares a
new one carrying the same intake hash under the buyer; an empty key aborts.

### Task 6: `feat(move): custodial wallets, holds, and the payout that must be emptied`

File: `packages/move/sources/escrow.move`, the structs, events, and functions in the spec. Abort
codes: `EInsufficientFunds` 0, `EWrongOwner` 1, `EPayoutNotEmpty` 2, `EZeroAmount` 3, `EEmptyKey`
4. Reason codes match the Prisma `LedgerTransactionKind` order: DEPOSIT 0, HOLD_FUNDS 1,
REFUND_HOLD 2, ORIGINATE_LOAN 3, REPAY_LOAN 4, SELL_NOTE 5, SETTLE_LIQUIDATION 6, WITHDRAW 7.
`hold` calls `config::assert_not_paused`; nothing else does.

### Task 7: `test(move): holds release exactly what they held and refund once`

File: `packages/move/tests/escrow_tests.move`. Mirrors the settlement contract suite: a hold makes
the funds unavailable (wallet balance falls, hold object carries them); a hold beyond the balance
aborts `EInsufficientFunds`; a refund returns the funds to the owner's wallet and the object is
gone; a refund into somebody else's wallet aborts `EWrongOwner`; a release paid to two wallets
leaves the payout empty and `finish_release` succeeds; a release with funds left aborts
`EPayoutNotEmpty`; `pay_new` opens a wallet for a stranger; `transfer` moves between wallets and
refuses beyond the balance; `withdraw` sends a coin to the owner and nobody else; a hold while
paused aborts `EPaused`; a refund while paused succeeds; a release while paused succeeds.

### Task 8: `feat(move): attest domain events beside the settlement that caused them`

File: `packages/move/sources/attestation.move`, `attest` and `DomainEventAttested` as in the spec.
Test in `packages/move/tests/attestation_tests.move`: the event carries every field and the clock.

### Task 9: `feat(move): accrue interest with the borrower's rounding`

File: `packages/move/sources/interest.move`. `MS_PER_YEAR` is `31_536_000_000`. `accrued` clamps
elapsed at maturity and at zero, multiplies in `u128`, truncates. `amount_due` adds the principal.
Hand written tests in `packages/move/tests/interest_tests.move` for the two clamps and the
overflow case (ten billion principal, 3600 basis points, a full year).

### Task 10: `test(move): interest agrees with the shared fixtures`

Files: create `scripts/generate-move-fixtures.ts` (reads
`packages/test-support/src/fixtures/interest.json`, writes
`packages/move/tests/interest_fixtures_tests.move`, one `#[test]` per case named from the fixture
name in snake case); create the generated file; add root script `move:fixtures`; create
`apps/api/src/infrastructure/chain/move-fixtures.spec.ts` asserting the generated file equals a
fresh generation, so a fixture edit without a regeneration fails the unit suite.

---

## Slice p10b-chain-client

Exit: the api can load a chain configuration, publish the package to a localnet and record the
deployment, derive addresses, build every transaction shape as a pure function, and run a unit of
work that submits one transaction and resolves its references.

### Task 1: `feat(api): chain configuration and the deployment it needs`

Files: create `apps/api/src/config/chain-configuration.ts` (`loadChainConfiguration()` reading
`SUI_NETWORK`, `SUI_GRPC_URL`, `SUI_FAUCET_URL`, `SUI_OPERATOR_SECRET_KEY`, `SUI_ACCOUNT_SEED`;
throws naming the first missing variable when a chain driver is on); create migration
`chain_deployment` (id `ACTIVE`, network, package_id, config_id, admin_cap_id, operator_cap_id,
custodian_cap_id, treasury_cap_id, usd_coin_type, published_at, published_by); create
`apps/api/src/infrastructure/chain/chain-deployment.ts` (the `ChainDeployment` interface) and
`chain-deployment.registry.ts` (`ChainDeploymentRegistry.onModuleInit` loads the row, `current()`
throws `ChainDeploymentMissing` when absent, `record(deployment)` upserts).

Test: unit test of `loadChainConfiguration` for defaults per network and the missing variable
message.

### Task 2: `feat(api): a gRPC client and the operator that signs`

Files: create `apps/api/src/infrastructure/chain/chain-client.ts` (`createChainClient(config):
SuiGrpcClient`), `operator-signer.ts` (`OperatorSigner` holding the `Ed25519Keypair` from the
bech32 secret, exposing `address` and `keypair`), `chain.module.ts` (global, provides the
configuration, client, signer, deployment registry, and later everything else in this directory;
imported by `AppModule` only when a chain driver is on).

### Task 3: `feat(api): publish the move package and record the deployment`

Files: create `apps/api/src/infrastructure/chain/publish/build-package.ts` (runs `sui move build
--dump-bytecode-as-base64 --path packages/move`, parses `{ modules, dependencies }`),
`publish/publish-package.ts` (`publishPackage({ client, signer, prisma, network }):
Promise<ChainDeployment>`: funds the operator from the faucet when `faucetUrl` is set and the
balance is low, builds `tx.publish`, transfers the upgrade capability to the operator, executes with
`objectTypes` and `events`, reads the package id from the `PackageWrite` object, the caps and
config from the created objects by type, writes the deployment); create
`apps/api/scripts/chain-publish.ts` (CLI entry) and root script `chain:publish`.

Test: none beyond the integration suites that use it.

### Task 4: `feat(api): derive member addresses and remember their wallets`

Files: migration `chain_account_address` (account_id primary, address unique) and `chain_wallet`
(account_id, currency, object_id nullable, unique on account and currency); create
`apps/api/src/infrastructure/chain/account-address.directory.ts`
(`AccountAddressDirectory.resolve(accountId, context): Promise<string>`, derives
`Ed25519Keypair.deriveKeypairFromSeed(hmacSha256(seed, accountId))` on first use, maps the
platform sentinels to the operator address); create `wallet.directory.ts`
(`WalletDirectory.find(accountId, currency, context): Promise<{ objectId } | null>`,
`register(...)`).

Test: unit test that derivation is deterministic and distinct per account, and that a sentinel
resolves to the operator.

### Task 5: `feat(api): pure builders for every chain call`

Files: create `apps/api/src/infrastructure/chain/ptb/` with one file per Move function family:
`escrow-calls.ts` (`appendOpenWallet`, `appendDeposit`, `appendMint` for the treasury,
`appendWithdraw`, `appendHold`, `appendRefundHold`, `appendRelease` taking the ordered
distribution with each recipient either `{ walletId }` or `{ newOwner }`, `appendTransfer`),
`custody-calls.ts` (one per custody function), `config-calls.ts` (`appendPause`,
`appendUnpause`, `appendSetParameters`), `attestation-calls.ts` (`appendAttest`), and
`codec.ts` (item category to code, reason to code, string to bytes, address normalisation).

Every function takes `(transaction: Transaction, deployment: ChainDeployment, input)` and returns
nothing or the result handle it created. No client, no database.

### Task 6: `test(api): builders produce the expected command shapes`

File: `apps/api/src/infrastructure/chain/ptb/escrow-calls.spec.ts` and one per family. Each test
builds a transaction, reads `transaction.getData().commands`, and asserts the move call target,
type arguments, and argument kinds. The release test asserts the sequence `begin_release`,
`pay` or `pay_new` per recipient in order, `finish_release`.

### Task 7: `feat(api): one programmable transaction per unit of work`

Files: create `apps/api/src/infrastructure/chain/chain-settlement-ref.ts` (`ChainSettlementRef
implements SettlementRef`, `reference` getter reading `pending:<token>` until `resolve(digest)`),
`chain-execution.ts` (`ChainExecution { digest, events: ParsedChainEvent[], createdObjectIds:
Map<type, string[]>, executedAt }` and `ChainSubmitter` interface), `chain-submitter.ts`
(`GrpcChainSubmitter` over `SerialTransactionExecutor`, `include: { effects, events,
objectTypes }`, throws `ChainExecutionFailed` carrying the Move abort), `sui-unit-of-work.ts`
(`SuiUnitOfWorkContext extends PrismaUnitOfWorkContext` with `driver = 'sui'`,
`chainTransaction`, `startedAt`, `issueSettlementRef()`, `expectObjectId(eventType, match)`,
`onResolved(callback)`; `SuiUnitOfWork.run` as in the spec, Prisma transaction timeout 120
seconds), `pending-reference-patches.ts` (`patchPendingReferences(transaction, token, digest,
since)` over `loan.origination_settlement_reference`, `outbox_event.payload`,
`audit_log.before`, `audit_log.after`).

Modify `apps/api/src/infrastructure/persistence/prisma-unit-of-work.ts` only to make the context
class extensible (a protected constructor is not needed; the subclass passes the transaction up).

### Task 8: `test(api): pending references resolve to the digest after commit`

File: `apps/api/test/sui-unit-of-work.integration.spec.ts` with a fake submitter recorded in
memory. Cases: a unit of work with no chain commands never calls the submitter; a reference issued
inside the work reads pending until commit and the digest after; a loan row and an outbox payload
written with the pending token carry the digest after commit; a submitter failure rolls the
database back and rethrows; an `expectObjectId` resolves from the fake execution's events.

---

## Slice p10c-sui-settlement

Exit: `describeSettlementPortContract('sui', ...)` green against a localnet.

### Task 1: `feat(api): chain settlement tables`

Migration: `chain_funds_hold` (id = funds hold id, account_id, currency, minor_units, object_id
nullable, status HELD RELEASED REFUNDED, hold_digest, settled_digest), `chain_settlement` (id,
digest, kind, reference, ledger_transaction_id, occurred_at, unique on digest and
ledger_transaction_id).

### Task 2: `feat(ledger): settle holds and transfers on chain with the ledger as the mirror`

File: replace `sui-settlement.adapter.ts`. Constructor takes the ledger adapter, the directories,
the deployment registry, the client, the clock. Behaviour per method exactly as the spec's adapter
section: mirror first, pre check, append, record, register resolution. `availableBalance` reads
the wallet object with `include: { json: true }` and returns zero when no wallet exists.

### Task 3: `feat(api): map move aborts onto the domain errors the ledger throws`

Files: create `chain-abort-codes.ts` (the mirror table and `domainErrorForAbort(module, code):
DomainError | null`); the submitter throws the domain error when one maps, `ChainExecutionFailed`
otherwise; create `chain-abort-codes.spec.ts` reading `packages/move/sources/*.move` constants and
asserting the table matches.

### Task 4: `feat(api): a localnet test network that publishes the package per suite`

File: create `apps/api/test/chain/chain-test-network.ts`: `isLocalnetReachable()`, and
`prepareChainDatabase(databaseUrl)` which publishes with a fresh operator key funded from the
faucet, writes the deployment row, and returns the environment the app needs. Modify
`create-test-application.ts` to accept `prepare?: (databaseUrl: string) => Promise<void>` run
after migrations and before the module compiles, and to accept environment overrides restored on
close.

### Task 5: `test(api): the settlement port contract passes against sui`

File: `apps/api/test/sui-settlement-port.integration.spec.ts`. Skips when the localnet is
unreachable. The subject deposits from the float to fund an account, reads balances from the
chain, reads held balances by summing the live hold objects of the account, checks a reference by
fetching the transaction, and answers the kind from `chain_settlement`. The ledger mirror sums to
zero after each test.

---

## Slice p10d-sui-custody

### Task 1: `feat(api): chain receipt table`

Migration `chain_receipt` (receipt_id primary, object_id nullable, issued_digest, unique
object_id).

### Task 2: `feat(custody): issue and move receipts on chain with the database as the projection`

Replace `sui-custody.adapter.ts` wrapping `DatabaseCustodyAdapter`; each method performs the
projection write then appends the custody call, resolving the object id from `ReceiptIssued` for
issue and reissue.

### Task 3: `test(api): the custody port contract passes against sui`

File: `apps/api/test/sui-custody-port.integration.spec.ts`, same skip rule, plus one assertion the
database subject cannot make: after a burn, the object no longer exists on chain.

---

## Slice p10e-config-events-lifecycle

### Task 1: `feat(admin): pause the chain config beside the database row`

`sui-system-state.adapter.ts` wrapping `DatabaseSystemStateAdapter`, appending `pause` or
`unpause`; module wiring by driver.

### Task 2: `feat(parameters): mirror parameter versions onto the chain config`

`sui-protocol-parameters.adapter.ts` wrapping the registry; `writeVersion` appends
`set_parameters` when the effective instant is not in the future, otherwise records nothing and the
open question covers it.

### Task 3: `feat(events): attest every domain event in the transaction that caused it`

`sui-domain-event-publisher.ts` wrapping the outbox publisher; the payload is the outbox JSON with
pending references written as `self`.

### Task 4: `feat(api): wire the chain adapters behind the driver switches`

`ChainModule` imported by `AppModule` when a chain driver is on; `PersistenceModule` provides
`UNIT_OF_WORK` through a factory choosing `SuiUnitOfWork`; the settlement, custody, system state,
parameters, and platform services modules choose their adapter the same way. A boot with a chain
driver and no deployment fails with `ChainDeploymentMissing`.

### Task 5: `test(api): a loan originates, repays, defaults and liquidates on chain`

File: `apps/api/test/chain-lifecycle.integration.spec.ts`, HTTP through the app on both chain
drivers: intake to receipt, listing, two offers, acceptance, repayment, redemption request; a
second loan defaulted and claimed; a third liquidated at a surplus with a reissued receipt. Each
step asserts the response reference is a digest that the client can fetch, and the suite ends with
the mirror summing to zero and no `pending:` token in any of the patched columns.

### Task 6: `test(api): pausing on chain blocks holds and never blocks refunds`

Same file or a sibling: pause through the admin endpoint, a hold fails with `SYSTEM_PAUSED`, a
reclaim and a repayment succeed, and `Config.paused` on chain reads true.

---

## Slice p10f-indexer

### Task 1: `feat(indexer): chain event table and durable cursor`

Migration `chain_event` (id = `<digest>:<index>`, checkpoint, digest, event_index, module,
event_type, sender, json, ingested_at) and `chain_indexer_cursor` (module primary, cursor,
updated_at).

### Task 2: `feat(indexer): ingest package events idempotently from the fullnode`

`apps/api/src/infrastructure/chain/indexer/chain-event.indexer.ts`: `drainOnce()` walks each
module with `ledgerService.listEvents` streaming from the stored cursor, inserts with
`ON CONFLICT DO NOTHING` and advances the cursor in the same transaction per page; `start` and
`stop` on a timer like the outbox drain; `replayFrom(0)` resets cursors and drains.

### Task 3: `test(indexer): duplicates, restarts, and a full replay`

`apps/api/test/chain-indexer.integration.spec.ts`: the same page processed twice leaves one row per
event; a new indexer instance resumes from the cursor and ingests only what is new; truncating the
table and replaying reproduces the identical rows.

### Task 4: `feat(operations): reconcile wallets, holds, and receipts against the chain`

`apps/api/src/infrastructure/chain/indexer/chain-reconciliation.ts` returning drift rows as in the
spec; `GET /admin/chain/reconciliation` for operations, contract schema
`chainReconciliationResponseSchema`.

### Task 5: `test(operations): a corrupted projection row shows as chain drift`

Corrupt `chain_funds_hold.minor_units` and a receipt's holder in the database, run the
reconciliation, assert both drift rows and nothing else.

---

## Slice p11a-chain-demo

### Task 1: `feat(ui): render a chain settlement reference as an explorer link`

`packages/ui/src/settlement-reference.tsx`: `ledger` renders the short tail with the full value in
a title as the wallet screen does today; `chain` renders a link to
`https://suiscan.xyz/<network>/tx/<digest>` on testnet or mainnet and the digest with a copy button
on localnet. Unit test per branch.

### Task 2: `feat(api): report the chain network on the health endpoint`

`chain: { network } | null` on the health response and its contract schema.

### Task 3: `feat(marketplace-ui): show the origination reference on a position`

The position detail renders `SettlementReference` for `originationSettlementRef`; the admin deposit
tool renders the same for its last reference.

### Task 4: `feat(demo): a localnet service and a publish on first boot`

`docker-compose.yml` gains `sui` (the `mysten/sui-tools` image running `sui start
--force-regenesis --with-faucet`), the api service gains the chain environment, and
`docker/api-entrypoint.sh` runs `chain-publish` when a chain driver is on and no deployment row
exists.

### Task 5: `ci: start a localnet for the chain suites`

`.github/workflows/ci.yml` downloads the Sui release matching the pinned version, starts a
localnet with a faucet in the background, and exports `SUI_GRPC_URL` and `SUI_FAUCET_URL`.

### Task 6: `docs(flows): record what each flow became on chain`

The Phase 3 paragraphs of flows 1 to 9, 11, 12, 13 and 18 describe what was built: the operator
signed transaction, the wallet and hold objects, the custodian attested receipt, and the
attestation of the market's transitions.

### Task 7: `docs(move): record the design in the migration guide and the write up`

`docs/08-web3-migration.md` mapping table and package layout updated to the built design;
`DOCUMENTATION.md` gains a Phase 3 section; `docs/DEMO.md` gains a chain mode addendum;
`docs/OPEN-QUESTIONS.md` gains the five questions the spec raises.

---

## Self review

Spec coverage: every module, the execution model, all five adapters, identity, deployment,
drivers, the indexer, reconciliation, every test family, the frontend component, and the demo
wiring each map to a task above. Deferred items map to the open questions task.

Type consistency: `ChainDeployment`, `ChainSettlementRef`, `ChainExecution`, `ChainSubmitter`,
`SuiUnitOfWorkContext`, `AccountAddressDirectory`, `WalletDirectory`, and the `append*` builder
names are used with the same spelling in every slice that references them.
