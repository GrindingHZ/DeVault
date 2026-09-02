# Secondary Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lender lists their note at an ask capped at current value; another lender buys it in one
atomic transaction; a dedicated marketplace page shows each sale with a value chart.

**Architecture:** A new NoteSale entity in the lending domain, sold by reassigning the existing
LenderNote holder. The settlement port learns to name why money moves (a TransferReason, echoing
Q-010), giving the ledger a SELL_NOTE kind. Read side follows the CQRS query-port pattern; the UI
is a dedicated `/listings/positions` page built on the existing ValueChart, plus sell and withdraw
actions on the portfolio.

**Tech Stack:** NestJS, Prisma, Postgres, Zod contracts, TanStack Router and Query, Vitest,
Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-secondary-market-design.md`

## Global Constraints

- Prose rules apply to every committed file including comments and UI copy: no em dashes, no curly
  quotes, no emoji (`scripts/check-prose.sh`).
- No `any`, no non-null `!` outside test fixtures, no `as` casts to silence the compiler.
- Comments explain why, never what.
- One write use case is one database transaction (`unitOfWork.run`).
- Domain files import nothing from Prisma, Nest, or HTTP.
- UI uses design tokens only; the token file is frozen.
- Money math on the server; the client formats and draws, it does not price.
- Commit after every green task, one line, `type(scope): summary`, no body.
- Run `pnpm check` before calling any task done.
- Every note sale write use case locks the loan row first (`loans.lock`), so listing, withdrawal,
  purchase, repayment, and default marking all serialise on the same lock.

---

### Task 1: TransferReason on the settlement port and the SELL_NOTE kind

**Files:**
- Modify: `apps/api/src/domain/ports/settlement.port.ts`
- Modify: `apps/api/src/infrastructure/settlement/ledger-settlement.adapter.ts` (delete `transferKindOf`, lines 210-221)
- Modify: `apps/api/src/modules/lending/application/repay-loan.use-case.ts:87-95`
- Modify: `apps/api/src/modules/ledger/application/deposit.use-case.ts:44`
- Modify: `apps/api/src/modules/ledger/application/withdraw.use-case.ts:32`
- Modify: the domain ledger kind union (find `LedgerTransactionKind` in `apps/api/src/domain/ledger/`, add `SELL_NOTE`)
- Modify: `apps/api/prisma/schema.prisma` (enum `LedgerTransactionKind`, add `SELL_NOTE`)
- Create: migration `sell_note_kind` via `pnpm --filter @depawn/api exec prisma migrate dev --name sell_note_kind` (database up first: `pnpm db:up`)
- Test: `packages/test-support/src/settlement-port.contract.ts`

**Interfaces:**
- Produces: `type TransferReason = 'DEPOSIT' | 'WITHDRAW' | 'REPAY_LOAN' | 'SELL_NOTE'`;
  `TransferCommand` gains `readonly reason: TransferReason`. Every later task that calls
  `settlement.transfer` passes a reason.

- [ ] **Step 1: Extend the contract suite first.** In `settlement-port.contract.ts`, add
  `reason: 'REPAY_LOAN'` to every existing `TransferCommand`, and add one new case: transfer with
  `reason: 'SELL_NOTE'` between two funded accounts, then assert
  `await subject.transactionKindOf(reference)` returns `'SELL_NOTE'`. Also assert an existing
  user to user transfer writes `'REPAY_LOAN'`.
- [ ] **Step 2: Run the suite runner to verify it fails to compile** (the command lacks `reason`):
  `pnpm --filter @depawn/api exec vitest run --config vitest.integration.config.ts test/settlement-port.integration.spec.ts`
- [ ] **Step 3: Implement.** In `settlement.port.ts`, beside `ReleaseReason` and with the same
  Q-010 rationale comment style:

```ts
/* Why money is moving, which the ledger records as the kind. Named at the
   call site for the same reason releaseHold names its reason (Q-010): the
   adapter must not guess the kind from who the participants are. */
export type TransferReason = 'DEPOSIT' | 'WITHDRAW' | 'REPAY_LOAN' | 'SELL_NOTE';

export interface TransferCommand {
  readonly fromAccountId: AccountId;
  readonly toAccountId: AccountId;
  readonly amount: Money;
  readonly reference: string;
  readonly reason: TransferReason;
}
```

  In the adapter, replace `this.transferKindOf(command)` with `command.reason` and delete
  `transferKindOf` and its comment. Add `SELL_NOTE` to the domain ledger kind union and the Prisma
  enum, generate the migration (it must contain only
  `ALTER TYPE "ledger_transaction_kind" ADD VALUE 'SELL_NOTE';`, its own migration so the value is
  committed before anything writes it). Update the three callers: repay passes `'REPAY_LOAN'`,
  deposit `'DEPOSIT'`, withdraw `'WITHDRAW'`.
- [ ] **Step 4: Run the settlement contract suite and the API unit tests, expect green:**
  `pnpm --filter @depawn/api exec vitest run --config vitest.integration.config.ts test/settlement-port.integration.spec.ts && pnpm --filter @depawn/api test:unit`
- [ ] **Step 5: Commit:** `feat(ledger): let the transfer caller name why money moves`

---

### Task 2: NoteSale entity, purchase policy, errors, identifiers, events

**Files:**
- Create: `apps/api/src/domain/lending/note-sale.ts`
- Create: `apps/api/src/domain/lending/note-sale-purchase-policy.ts`
- Create: `apps/api/src/domain/lending/note-sale-not-open.ts`, `ask-exceeds-current-value.ts`,
  `cannot-buy-own-position.ts`, `note-transfer-disabled.ts`, `note-sale-not-found.ts`,
  `note-already-listed.ts`
- Modify: `apps/api/src/domain/shared/identifiers.ts` (add `NoteSaleId`, `noteSaleIdOf`)
- Modify: `apps/api/src/domain/shared/domain-event.ts` (four new events)
- Test: `apps/api/src/domain/lending/note-sale.spec.ts`,
  `apps/api/src/domain/lending/note-sale-purchase-policy.spec.ts`

**Interfaces:**
- Consumes: `LenderNote`, `Loan`, `ProtocolParameters`, `Money`, `Instant`, `Result`.
- Produces: `NoteSale` with `static list`, `withdraw`, `markSold`, `markVoided`, `static restore`,
  `allows`; `assertNoteSalePurchasable`; `NoteSaleStatus`; `allowedNoteSaleTransitions`; the six
  error classes; `NoteSaleId`.

- [ ] **Step 1: Write the failing entity spec.** Follow `loan.spec.ts` conventions: explicit
  vitest imports, local factory over the static constructor, transition table test driven by the
  exported `allowedNoteSaleTransitions`. Cases: list succeeds for the holder of a transferable
  note on an ACTIVE loan at an ask equal to current value; list refuses when the parameter is off,
  when the note is not transferable, when the lister is not the holder, when the loan is REPAID,
  and when the ask is one minor unit above `loan.calculateAmountDue(now)` (the failure carries
  `currentValue`); the constructor throws on a non-positive ask; withdraw refuses a stranger with
  `FORBIDDEN` and refuses a SOLD sale with `NOTE_SALE_NOT_OPEN`; markSold and markVoided only move
  OPEN.
- [ ] **Step 2: Run to verify failure:** `pnpm --filter @depawn/api exec vitest run src/domain/lending/note-sale.spec.ts`
- [ ] **Step 3: Implement the errors and the entity.** Errors follow `loan-not-active.ts` exactly;
  `AskExceedsCurrentValue` carries the figure the controller returns as details:

```ts
import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

export class AskExceedsCurrentValue extends DomainError {
  readonly code = 'ASK_EXCEEDS_CURRENT_VALUE';

  constructor(readonly currentValue: Money) {
    super('The ask exceeds the current value of the position.');
  }
}
```

  Codes for the rest: `NOTE_SALE_NOT_OPEN` ('The sale is not open.'), `CANNOT_BUY_OWN_POSITION`
  ('You already hold a side of this loan.'), `NOTE_TRANSFER_DISABLED` ('Note transfer is not
  enabled.'), `NOT_FOUND` on `NoteSaleNotFound` ('The sale does not exist.'), `NOTE_ALREADY_LISTED`
  ('The note already has an open sale.'). The entity:

```ts
export type NoteSaleStatus = 'OPEN' | 'SOLD' | 'WITHDRAWN' | 'VOIDED';
export type NoteSaleEvent = 'purchase' | 'withdraw' | 'void';

export const allowedNoteSaleTransitions: Record<NoteSaleStatus, readonly NoteSaleEvent[]> = {
  OPEN: ['purchase', 'withdraw', 'void'],
  SOLD: [],
  WITHDRAWN: [],
  VOIDED: [],
};

interface NoteSaleFields {
  readonly id: NoteSaleId;
  readonly lenderNoteId: LenderNoteId;
  readonly loanId: LoanId;
  readonly sellerAccountId: AccountId;
  readonly askPrice: Money;
  readonly createdAt: Instant;
  readonly status: NoteSaleStatus;
  readonly version: number;
}

export type ListNoteForSaleRejected =
  NoteTransferDisabled | NotResourceOwner | LoanNotActive | AskExceedsCurrentValue;

export type NoteSaleWithdrawalRejected = NoteSaleNotOpen | NotResourceOwner;

export interface ListNoteForSaleInput {
  readonly id: NoteSaleId;
  readonly note: LenderNote;
  readonly loan: Loan;
  readonly sellerAccountId: AccountId;
  readonly askPrice: Money;
  readonly parameters: ProtocolParameters;
  readonly now: Instant;
}

export class NoteSale {
  private constructor(private readonly fields: NoteSaleFields) {
    if (fields.askPrice.isNegative() || fields.askPrice.isZero()) {
      throw new Error('An ask price must be positive');
    }
  }

  /* getters for every field, following Loan */

  /* The cap is checked at listing time only: interest keeps accruing, so a
     sale that was inside the cap can never fall out of it (the spec's rule). */
  static list(input: ListNoteForSaleInput): Result<NoteSale, ListNoteForSaleRejected> {
    if (!input.parameters.notesTransferable || !input.note.transferable) {
      return failure(new NoteTransferDisabled());
    }
    if (input.note.holderAccountId !== input.sellerAccountId) {
      return failure(new NotResourceOwner());
    }
    if (input.loan.status !== 'ACTIVE') {
      return failure(new LoanNotActive());
    }
    const currentValue = input.loan.calculateAmountDue(input.now);
    if (input.askPrice.isGreaterThan(currentValue)) {
      return failure(new AskExceedsCurrentValue(currentValue));
    }
    return ok(new NoteSale({
      id: input.id,
      lenderNoteId: input.note.id,
      loanId: input.loan.id,
      sellerAccountId: input.sellerAccountId,
      askPrice: input.askPrice,
      createdAt: input.now,
      status: 'OPEN',
      version: 0,
    }));
  }

  static restore(fields: NoteSaleFields): NoteSale { return new NoteSale(fields); }

  withdraw(requestedBy: AccountId): Result<NoteSale, NoteSaleWithdrawalRejected> {
    if (this.fields.sellerAccountId !== requestedBy) {
      return failure(new NotResourceOwner());
    }
    if (!this.allows('withdraw')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'WITHDRAWN' }));
  }

  markSold(): Result<NoteSale, NoteSaleNotOpen> {
    if (!this.allows('purchase')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'SOLD' }));
  }

  markVoided(): Result<NoteSale, NoteSaleNotOpen> {
    if (!this.allows('void')) {
      return failure(new NoteSaleNotOpen());
    }
    return ok(new NoteSale({ ...this.fields, status: 'VOIDED' }));
  }

  allows(event: NoteSaleEvent): boolean {
    return allowedNoteSaleTransitions[this.fields.status].includes(event);
  }
}
```

- [ ] **Step 4: Write the failing policy spec, then the policy.** Pure function, one file:

```ts
export type PurchaseNoteRejected =
  NoteSaleNotOpen | NoteTransferDisabled | LoanNotActive | CannotBuyOwnPosition;

export interface PurchaseAttempt {
  readonly sale: NoteSale;
  readonly loan: Loan;
  readonly note: LenderNote;
  readonly buyerAccountId: AccountId;
  readonly parameters: ProtocolParameters;
}

export function assertNoteSalePurchasable(attempt: PurchaseAttempt): Result<void, PurchaseNoteRejected> {
  if (!attempt.sale.allows('purchase')) {
    return failure(new NoteSaleNotOpen());
  }
  if (!attempt.parameters.notesTransferable || !attempt.note.transferable) {
    return failure(new NoteTransferDisabled());
  }
  if (attempt.loan.status !== 'ACTIVE') {
    return failure(new LoanNotActive());
  }
  /* A holder who is no longer the seller means the sale is describing a note
     it no longer speaks for, which is the same refusal as a closed sale. */
  if (attempt.note.holderAccountId !== attempt.sale.sellerAccountId) {
    return failure(new NoteSaleNotOpen());
  }
  if (
    attempt.buyerAccountId === attempt.sale.sellerAccountId ||
    attempt.buyerAccountId === attempt.loan.borrowerAccountId
  ) {
    return failure(new CannotBuyOwnPosition());
  }
  return ok(undefined);
}
```

  Policy spec cases: happy path, each refusal, and the borrower refusal specifically (the spec's
  buyback exclusion).
- [ ] **Step 5: Add the domain events** to the union in `domain-event.ts`, matching the existing
  naming (future Move structs):

```ts
| { readonly type: 'NoteListedForSale'; readonly noteSaleId: NoteSaleId; readonly loanId: LoanId; readonly askPrice: Money }
| { readonly type: 'NoteSaleWithdrawn'; readonly noteSaleId: NoteSaleId }
| { readonly type: 'NoteSold'; readonly noteSaleId: NoteSaleId; readonly loanId: LoanId; readonly fromAccountId: AccountId; readonly toAccountId: AccountId; readonly price: Money; readonly settlementRef: SettlementRef }
| { readonly type: 'NoteSaleVoided'; readonly noteSaleId: NoteSaleId; readonly loanId: LoanId }
```

- [ ] **Step 6: Run all API unit tests, expect green:** `pnpm --filter @depawn/api test:unit`
- [ ] **Step 7: Commit:** `feat(lending): model the note sale and its purchase policy`

---

### Task 3: Persistence for the sale and the note transfer

**Files:**
- Create: `apps/api/src/domain/lending/note-sale-repository.ts`
- Create: `apps/api/src/infrastructure/persistence/repositories/prisma-note-sale.repository.ts`
- Modify: `apps/api/src/domain/lending/loan-repository.ts`
- Modify: `apps/api/src/infrastructure/persistence/repositories/prisma-loan.repository.ts`
- Modify: `apps/api/src/infrastructure/persistence/mappers/lending.mapper.ts` (add `toNoteSale`, `toNoteSaleRow`)
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration `note_sales` (then append the partial unique index to its SQL before applying)

**Interfaces:**
- Produces:

```ts
export interface NoteSaleRepository {
  findById(id: NoteSaleId, context: UnitOfWorkContext): Promise<NoteSale | null>;
  findOpenByLoanId(loanId: LoanId, context: UnitOfWorkContext): Promise<NoteSale | null>;
  create(sale: NoteSale, context: UnitOfWorkContext): Promise<void>;
  save(sale: NoteSale, context: UnitOfWorkContext): Promise<void>;
}
export const NOTE_SALE_REPOSITORY = Symbol('NoteSaleRepository');
```

  `LoanRepository` gains:
  `findByLenderNoteId(noteId: LenderNoteId, context): Promise<Loan | null>`,
  `findLenderNoteById(noteId: LenderNoteId, context): Promise<LenderNote | null>`,
  `reassignLenderNoteHolder(noteId: LenderNoteId, holderAccountId: AccountId, context): Promise<void>`.

- [ ] **Step 1: Schema.** Add to `schema.prisma`, following the mapping conventions exactly:

```prisma
enum NoteSaleStatus {
  OPEN
  SOLD
  WITHDRAWN
  VOIDED

  @@map("note_sale_status")
}

model NoteSale {
  id                 String         @id
  lenderNoteId       String         @map("lender_note_id")
  loanId             String         @map("loan_id")
  sellerAccountId    String         @map("seller_account_id")
  askPriceMinorUnits BigInt         @map("ask_price_minor_units")
  currency           String
  status             NoteSaleStatus
  version            Int            @default(0)
  createdAt          DateTime       @default(now()) @map("created_at")
  updatedAt          DateTime       @updatedAt @map("updated_at")

  @@index([status])
  @@index([sellerAccountId, status])
  @@index([loanId, status])
  @@map("note_sale")
}
```

- [ ] **Step 2: Migration.** `pnpm --filter @depawn/api exec prisma migrate dev --name note_sales --create-only`,
  then append to the generated SQL (Prisma cannot express a partial index; the index is what backs
  the one-open-sale invariant under concurrency):

```sql
CREATE UNIQUE INDEX "note_sale_one_open_per_note"
  ON "note_sale" ("lender_note_id") WHERE status = 'OPEN';
```

  Apply with `pnpm --filter @depawn/api exec prisma migrate dev`.
- [ ] **Step 3: Mappers and repositories.** `toNoteSale(row)` and `toNoteSaleRow(sale)` in
  `lending.mapper.ts` mirroring the loan pair (money from `askPriceMinorUnits` plus `currency`).
  `PrismaNoteSaleRepository` mirrors `PrismaLoanRepository`: `create` inserts with `version: 0`,
  `save` is the version guarded `updateMany` throwing `StaleNoteSaleVersionError` (declared in the
  repository file like `StaleLoanVersionError`). `findOpenByLoanId` is
  `findFirst({ where: { loanId, status: 'OPEN' } })`. Loan repository additions: `findByLenderNoteId`
  via `loan.findUnique({ where: { lenderNoteId } })`, `findLenderNoteById` via
  `lenderNote.findUnique({ where: { id } })` mapped with the existing `toLenderNote`, and
  `reassignLenderNoteHolder` via `lenderNote.update({ where: { id }, data: { holderAccountId } })`.
- [ ] **Step 4: Typecheck:** `pnpm --filter @depawn/api exec tsc --noEmit` (or `pnpm check` scoped run). Persistence is proven by Task 6.
- [ ] **Step 5: Commit:** `feat(lending): persist note sales and the holder reassignment`

---

### Task 4: The three use cases and the voiding

**Files:**
- Create: `apps/api/src/modules/lending/application/list-note-for-sale.use-case.ts`
- Create: `apps/api/src/modules/lending/application/withdraw-note-sale.use-case.ts`
- Create: `apps/api/src/modules/lending/application/purchase-note-sale.use-case.ts`
- Modify: `apps/api/src/modules/lending/application/repay-loan.use-case.ts`
- Modify: `apps/api/src/modules/lending/application/mark-default.use-case.ts`
- Modify: `apps/api/src/modules/lending/lending-api.module.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3; `PROTOCOL_PARAMETERS`, `ID_GENERATOR`, `CLOCK_PORT`,
  `SETTLEMENT_PORT`, `AUDIT_PORT`, `DOMAIN_EVENT_PUBLISHER`, `UNIT_OF_WORK`.
- Produces:
  `ListNoteForSaleUseCase.execute({ lenderNoteId, requestedBy, askPrice }): Promise<Result<NoteSale, DomainError>>`,
  `WithdrawNoteSaleUseCase.execute({ noteSaleId, requestedBy }): Promise<Result<NoteSale, DomainError>>`,
  `PurchaseNoteSaleUseCase.execute({ noteSaleId, requestedBy }): Promise<Result<PurchaseOutcome, DomainError>>`
  where `PurchaseOutcome = { sale: NoteSale; paidTo: AccountId; price: Money }`.

- [ ] **Step 1: ListNoteForSaleUseCase.** Follow `repay-loan.use-case.ts` structurally (try and
  catch DomainError, one `unitOfWork.run`). Inside: `loan = loans.findByLenderNoteId`, null gives
  `LoanNotFound`; `loans.lock(loan.id)`; re-read loan after the lock; `note = loans.findLenderNoteById`;
  `noteSales.findOpenByLoanId(loan.id)` non-null gives `NoteAlreadyListed`;
  `NoteSale.list({ id: noteSaleIdOf(this.idGenerator.generate()), note, loan, sellerAccountId: command.requestedBy, askPrice: command.askPrice, parameters: this.parameters, now })`;
  `noteSales.create`; publish `NoteListedForSale`; audit action `list_note_for_sale` with before
  `{ status: loan.status }` and after `{ askPrice: sale.askPrice.minorUnits.toString() }`.
- [ ] **Step 2: WithdrawNoteSaleUseCase.** `sale = noteSales.findById`, null gives
  `NoteSaleNotFound`; `loans.lock(sale.loanId)`; re-read the sale after the lock (the lock is what
  makes the read current); `sale.withdraw(command.requestedBy)`; `noteSales.save`; publish
  `NoteSaleWithdrawn`; audit `withdraw_note_sale`.
- [ ] **Step 3: PurchaseNoteSaleUseCase.** `sale = noteSales.findById`, null gives
  `NoteSaleNotFound`; `loans.lock(sale.loanId)`; re-read sale, loan, and note;
  `assertNoteSalePurchasable({ sale, loan, note, buyerAccountId: command.requestedBy, parameters })`;
  `settlement.transfer({ fromAccountId: command.requestedBy, toAccountId: sale.sellerAccountId, amount: sale.askPrice, reference: sale.id, reason: 'SELL_NOTE' }, context)`
  (the adapter throws `InsufficientFunds`, which the catch turns into a failure exactly as repay
  does); `sale.markSold()` then `noteSales.save`; `loans.reassignLenderNoteHolder(note.id, command.requestedBy)`;
  publish `NoteSold` with the settlementRef; audit `purchase_note_sale` with before
  `{ holder: sale.sellerAccountId }` and after `{ holder: command.requestedBy, price: sale.askPrice.minorUnits.toString() }`.
- [ ] **Step 4: Voiding.** In `repay-loan.use-case.ts` after `this.loans.save(...)` and in
  `mark-default.use-case.ts` after its save, inject `NOTE_SALE_REPOSITORY` and add:

```ts
// A sale on a loan that just closed would advertise a claim that no longer
// pays, so it dies in the same transaction that closed the loan.
const openSale = await this.noteSales.findOpenByLoanId(loan.id, context);
if (openSale !== null) {
  const voided = openSale.markVoided();
  if (voided.ok) {
    await this.noteSales.save(voided.value, context);
    await this.events.publish(
      [{ type: 'NoteSaleVoided', noteSaleId: openSale.id, loanId: loan.id }],
      context,
    );
  }
}
```

- [ ] **Step 5: Wire the module.** Add the three use cases and
  `{ provide: NOTE_SALE_REPOSITORY, useClass: PrismaNoteSaleRepository }` to
  `lending-api.module.ts` providers.
- [ ] **Step 6: Typecheck and unit tests green:** `pnpm --filter @depawn/api test:unit`. Behaviour is proven by Task 6.
- [ ] **Step 7: Commit:** `feat(lending): list, withdraw, purchase, and void note sales`

---

### Task 5: Read side, contracts, and the five endpoints

**Files:**
- Create: `apps/api/src/domain/ports/note-sale-queries.port.ts`
- Create: `apps/api/src/infrastructure/persistence/queries/prisma-note-sale-queries.ts`
- Create: `apps/api/src/modules/lending/http/note-sale.controller.ts`
- Create: `apps/api/src/modules/lending/http/note-sale-response.mapper.ts`
- Create: `packages/contracts/src/note-sales.ts`
- Create: `packages/contracts/src/client/note-sales-client.ts`
- Modify: `packages/contracts/src/index.ts` (export both), `packages/contracts/src/error-codes.ts`,
  `packages/contracts/src/error-copy.ts`
- Modify: `apps/api/src/modules/shared/http/domain-error-status.ts`
- Modify: `packages/contracts/src/lending.ts` (loanResponse gains `lenderNoteId: z.string()`),
  the loan read model and `prisma-loan-queries.ts` select, and `lending-response.mapper.ts`
- Modify: `apps/api/src/modules/lending/lending-api.module.ts`

**Interfaces:**
- Produces (port):

```ts
export interface NoteSaleSummaryReadModel {
  readonly id: string;
  readonly loanId: string;
  readonly sellerAccountId: string;
  readonly status: 'OPEN' | 'SOLD' | 'WITHDRAWN' | 'VOIDED';
  readonly askPrice: Money;
  readonly createdAt: Instant;
  readonly itemDescription: string;
  readonly itemCategory: string;
  readonly principal: Money;
  readonly annualPercentageRateBasisPoints: number;
  readonly startedAt: Instant;
  readonly maturesAt: Instant;
  readonly accruedInterest: Money;
  readonly currentValue: Money;
  readonly maturityValue: Money;
}
export interface NoteSaleQueries {
  browseOpen(now: Instant): Promise<readonly NoteSaleSummaryReadModel[]>;
  mine(accountId: AccountId, now: Instant): Promise<readonly NoteSaleSummaryReadModel[]>;
  byId(id: string, now: Instant): Promise<NoteSaleSummaryReadModel | null>;
}
export const NOTE_SALE_QUERIES = Symbol('NoteSaleQueries');
```

- Produces (wire, `note-sales.ts`): `noteSaleStatusSchema`, `noteSaleSummarySchema` (the read model
  with instants as `z.iso.datetime()` and money as `moneySchema` from `./money`),
  `browseNoteSalesResponseSchema = { items, asOf }`, `myNoteSalesResponseSchema = { items, asOf }`,
  `noteSaleActionResponseSchema = { sale: noteSaleSummarySchema }`,
  `listNoteForSaleRequestSchema = { askPrice: moneySchema }`, and inferred types.
- Produces (client): `browseNoteSales(): Promise<BrowseNoteSalesResponse>`,
  `fetchMyNoteSales(): Promise<MyNoteSalesResponse>`,
  `listNoteForSale(lenderNoteId: string, body: ListNoteForSaleRequest, options: RequestOptions)`,
  `withdrawNoteSale(noteSaleId: string, options: RequestOptions)`,
  `purchaseNoteSale(noteSaleId: string, options: RequestOptions)`, all returning
  `NoteSaleActionResponse` for the writes.

- [ ] **Step 1: Codes and copy.** `error-codes.ts` gains `NOTE_SALE_NOT_OPEN`,
  `ASK_EXCEEDS_CURRENT_VALUE`, `CANNOT_BUY_OWN_POSITION`, `NOTE_ALREADY_LISTED`; `error-copy.ts`
  gains one sentence each (the completeness spec `error-copy.spec.ts` fails until both sides
  agree, run it: `pnpm --filter @depawn/contracts test:unit`). `domain-error-status.ts` gains
  `NOTE_SALE_NOT_OPEN: 409`, `NOTE_ALREADY_LISTED: 409`, `ASK_EXCEEDS_CURRENT_VALUE: 422`,
  `CANNOT_BUY_OWN_POSITION: 422`, `NOTE_TRANSFER_DISABLED: 422`.
- [ ] **Step 2: Query adapter.** Prisma join of `note_sale` to `loan` to `custody_receipt`
  (`loan.receiptId`), computing on the server with the domain calculator:

```ts
const accruedInterest = calculateAccruedInterest(principal, rate, startedAt, maturesAt, now);
const currentValue = principal.plus(accruedInterest);
const maturityValue = principal.plus(
  calculateAccruedInterest(principal, rate, startedAt, maturesAt, maturesAt),
);
```

  `browseOpen` filters `status: 'OPEN'` ordered newest first; `mine` filters by seller.
- [ ] **Step 3: Contracts.** Schemas and fetchers following `marketplace.ts` and
  `marketplace-client.ts` exactly (types inferred beneath each schema, fetchers through
  `requestJson`, writes taking `RequestOptions` last). Paths: `POST ${basePath}/notes/:id/sales`,
  `POST ${basePath}/sales/:id/withdraw`, `POST ${basePath}/sales/:id/purchase`,
  `GET ${basePath}/market/note-sales`, `GET ${basePath}/me/note-sales`.
- [ ] **Step 4: Controller and mapper.** `@Controller()` full-path style with
  `IdempotencyInterceptor` on the three POSTs, `@CurrentAccount()`, `ZodValidationPipe` on the
  list body. Writes re-read through `NOTE_SALE_QUERIES.byId` before answering (the convention:
  writes answer with what the read side would say). `ASK_EXCEEDS_CURRENT_VALUE` failures answer
  with `details: { currentValue: toMoneyDto(error.currentValue) }` via the `instanceof` narrowing
  repay uses. Browse and mine responses carry `asOf: isoOf(this.clock.now())`. Add
  `NoteSaleController` and the two new providers (`NOTE_SALE_QUERIES`) to the module.
- [ ] **Step 5: loanResponse gains `lenderNoteId`** (schema, read model, query select, response
  mapper), so the portfolio can name the note it is selling.
- [ ] **Step 6: Green check:** `pnpm check`
- [ ] **Step 7: Commit:** `feat(api): serve the note sale endpoints and their contracts`

---

### Task 6: Integration proof

**Files:**
- Create: `apps/api/test/note-sale.integration.spec.ts`

**Interfaces:**
- Consumes: the harness (`create-test-application.ts`), the endpoint surface from Task 5.

- [ ] **Step 1: Write the spec.** Copy the local helpers from `repayment.integration.spec.ts`
  (`loginAs`, `fund`, the receipt and origination walk, `amount`). Add a helper that flips the
  gate: as OPERATIONS, `GET /api/v1/admin/protocol-parameters`, then `PUT` the same body with
  `notesTransferable: true` (and `false` for the gate test). Cases, each asserting the ledger sums
  to zero via the shared `afterEach`:
  1. Seller lists at the cap, buyer purchases: buyer debited, seller credited, exactly one
     `ledgerTransaction` of kind `SELL_NOTE`, sale reads SOLD in `/me/note-sales`, and after
     `clock.advanceBy` plus re-login the borrower's repayment pays the buyer, not the seller.
  2. Repaying a loan voids its open sale (list, repay, sale reads VOIDED).
  3. Purchase with an unfunded buyer answers 422 `INSUFFICIENT_FUNDS` and changes nothing.
  4. Listing above current value answers 422 `ASK_EXCEEDS_CURRENT_VALUE` with
     `details.currentValue`.
  5. Listing with the gate off answers 422 `NOTE_TRANSFER_DISABLED`.
  6. The borrower and the seller each answer 422 `CANNOT_BUY_OWN_POSITION`.
  7. A second listing while one is open answers 409 `NOTE_ALREADY_LISTED`.
  8. Purchase after withdrawal answers 409 `NOTE_SALE_NOT_OPEN`.
- [ ] **Step 2: Run, expect green:**
  `pnpm --filter @depawn/api exec vitest run --config vitest.integration.config.ts test/note-sale.integration.spec.ts`
  Fix whatever it catches in Tasks 3 to 5.
- [ ] **Step 3: Commit:** `test(lending): prove the note sale flow end to end`

---

### Task 7: The positions page and the value chart

**Files:**
- Modify: `packages/ui/src/value-chart.tsx` (optional `markedAtMs` prop)
- Create: `apps/marketplace/src/positions/sale-chart.ts` and `sale-chart.spec.ts`
- Create: `apps/marketplace/src/positions/position-sale-card.tsx` and `position-sale-card.spec.tsx`
- Create: `apps/marketplace/src/positions/purchase-dialog.tsx`
- Create: `apps/marketplace/src/routes/listings.positions.tsx`
- Modify: `apps/marketplace/src/market-keys.ts`, `apps/marketplace/src/workspace/browse-controls.tsx`,
  `apps/marketplace/src/workspace/browse-pane.tsx`, `apps/marketplace/src/routes/listings.index.tsx`

**Interfaces:**
- Consumes: `ValueChart`, `ValueSeries`, `Card`, `Dialog`, `Button`, `StatusBadge`, `Chip`,
  `EmptyState`, `Skeleton`, `TabStrip`, `Tab`, `formatMoney`, `formatRate` from `@depawn/ui`;
  `browseNoteSales`, `purchaseNoteSale`, `NoteSaleSummary`, `nameForCategory`, `messageForError`
  from `@depawn/contracts`; `useFeedback`, `useCurrentAccount`, `marketKeys`.
- Produces: `saleChartSeriesOf(sale: NoteSaleSummary, asOfMs: number): readonly ValueSeries[]`;
  route `/listings/positions`; `marketKeys.noteSalesBrowse`, `marketKeys.myNoteSales`.

- [ ] **Step 1: Chart marker.** `ValueChartProps` gains `readonly markedAtMs?: number | undefined`.
  When set, draw a persistent vertical line at `xOf(markedAtMs)` (`stroke-edge`, width 1) and, for
  each series point whose `atMs` equals `markedAtMs`, the same `r={4}` ringed circle the hover
  state draws. No interpolation: the marker only marks real points, which is why the subject
  series must carry a point exactly at `asOf`. Extend the chart spec for it.
- [ ] **Step 2: Series builder, test first** (`sale-chart.spec.ts`: three subject points in time
  order, flat two point reference at the ask, marker point present at `asOfMs`):

```ts
import type { NoteSaleSummary } from '@depawn/contracts';
import type { ValueSeries } from '@depawn/ui';

/* The value line is genuinely straight: interest accrues pro rata and stops
   at maturity (docs/03-ledger-and-money.md), so three server priced points
   draw the whole truth and the client never computes a figure. */
export function saleChartSeriesOf(sale: NoteSaleSummary, asOfMs: number): readonly ValueSeries[] {
  const startMs = Date.parse(sale.startedAt);
  const matureMs = Date.parse(sale.maturesAt);
  return [
    {
      id: 'value',
      label: 'Position value',
      role: 'subject',
      points: [
        { atMs: startMs, minorUnits: BigInt(sale.principal.minorUnits) },
        { atMs: asOfMs, minorUnits: BigInt(sale.currentValue.minorUnits) },
        { atMs: matureMs, minorUnits: BigInt(sale.maturityValue.minorUnits) },
      ],
    },
    {
      id: 'ask',
      label: 'Asking price',
      role: 'reference',
      points: [
        { atMs: startMs, minorUnits: BigInt(sale.askPrice.minorUnits) },
        { atMs: matureMs, minorUnits: BigInt(sale.askPrice.minorUnits) },
      ],
    },
  ];
}
```

- [ ] **Step 3: The card.** `PositionSaleCard({ sale, asOfMs, onBuy })`: `Card` with the item
  description as title, category `Chip`, the chart
  (`<ValueChart testId="sale-chart" currency={...} markedAtMs={asOfMs} label={...} series={saleChartSeriesOf(sale, asOfMs)} />`),
  a figures row naming worth today (`currentValue`), at maturity (`maturityValue`), the ask, and
  the discount stated as words ("below today's value") with the difference formatted through
  `formatMoney` (display subtraction of two server figures, the `position.ts` precedent), the rate
  via `formatRate(sale.annualPercentageRateBasisPoints)`, maturity date via `formatInstant`, and a
  primary `Button` labelled `Buy this position` with `data-testid="buy-position"`. Component spec:
  renders the figures, the chart, and calls `onBuy` on press.
- [ ] **Step 4: The purchase dialog.** `PurchaseDialog({ sale, isOpen, onClose })`: `Dialog`
  titled `Buy this position`, stating what is paid now (the ask) and what the loan pays at
  maturity, a mutation on `purchaseNoteSale(sale.id, { idempotencyKey })` with the
  rotate-on-success key pattern from `use-position-actions.ts`, `useFeedback()` for outcomes,
  inline `role="alert"` for an `ApiError` branch (`messageForError`), and on success invalidate
  `marketKeys.noteSalesBrowse`, `marketKeys.myNoteSales`, `walletKeys.all`, and
  `marketKeys.myLoans('lender')`, then close.
- [ ] **Step 5: The route.** `listings.positions.tsx`: auth gate exactly as `listings.index.tsx`
  (pending skeleton, `Navigate` to login), `MarketShell` with an ordinary `Page`, a `TabStrip`
  whose first three tabs navigate to `/listings` with the matching `scope` search and whose fourth,
  `Positions for sale`, is active; a query on `marketKeys.noteSalesBrowse` over `browseNoteSales`;
  `asOfMs` parsed from the response `asOf` (the demo clock convention, never `Date.now()` for
  dates); own sales filtered out (`sellerAccountId !== viewerAccountId`, the browse-is-for-other-
  people precedent); a responsive card grid; `EmptyState` titled `No positions for sale right now`
  with description `A lender who wants an early exit lists their position here.`; error paragraph
  with `role="alert"`.
- [ ] **Step 6: The way in.** `BrowseControlsProps` gains `readonly onPositions: () => void`; a
  fourth `Tab` after the scope tabs, `label="Positions for sale"`, `isActive={false}`,
  `testId="scope-positions"`, `onSelect={props.onPositions}`. Thread the prop through
  `BrowsePane` and pass `() => void navigate({ to: '/listings/positions' })` in
  `listings.index.tsx`.
- [ ] **Step 7: Keys.** `marketKeys` gains `noteSalesBrowse: ['note-sales', 'browse'] as const`
  and `myNoteSales: ['note-sales', 'mine'] as const`.
- [ ] **Step 8: Green:** `pnpm --filter @depawn/marketplace test:unit && pnpm --filter @depawn/ui test:unit && pnpm check`
- [ ] **Step 9: Commit:** `feat(marketplace-ui): a positions page that draws what a sale is worth`

---

### Task 8: Selling from the portfolio

**Files:**
- Modify: `apps/marketplace/src/portfolio/position.ts` and its spec
- Modify: `apps/marketplace/src/portfolio/use-positions.ts`
- Modify: `apps/marketplace/src/portfolio/use-position-actions.ts`
- Modify: `apps/marketplace/src/routes/portfolio.tsx`
- Create: `apps/marketplace/src/portfolio/sell-position-dialog.tsx`

**Interfaces:**
- Consumes: `listNoteForSale`, `withdrawNoteSale`, `fetchMyNoteSales`, `toMinorUnits`, `Field`,
  `Dialog`, the Task 5 `lenderNoteId` on `LoanResponse`.
- Produces: `PositionAction` kinds gain `'sell'` and `'withdrawSale'`; `Position` gains
  `readonly lenderNoteId: string | null` and `readonly noteSale: { readonly id: string; readonly askPrice: MoneyValue } | null`;
  `positionOfLentLoan` gains an `openSale` parameter.

- [ ] **Step 1: Position mapping, test first.** In `position.ts`: an ACTIVE lent loan with no open
  sale keeps its current stage and gains action `{ label: 'Sell position', kind: 'sell' }` when it
  previously had none (a claimable or defaulted row keeps its existing action); an ACTIVE lent
  loan with an open sale reads stage `Listed for sale`, figure `{ label: 'Ask', value: formatMoney(sale.askPrice) }`,
  action `{ label: 'Withdraw sale', kind: 'withdrawSale' }`. Extend the position spec table.
- [ ] **Step 2: Wire the query.** `use-positions.ts` adds a `useQuery` on `marketKeys.myNoteSales`
  over `fetchMyNoteSales` and passes the OPEN sale for each loanId into `positionOfLentLoan`.
- [ ] **Step 3: Actions.** `use-position-actions.ts`: `runAction` handles `'withdrawSale'` via
  `withdrawNoteSale(position.noteSale.id, { idempotencyKey })` with success copy
  `The sale is withdrawn. The position is yours again.`; `'sell'` escapes through a new
  `onSell(position)` handler. Invalidate `marketKeys.myNoteSales` and `marketKeys.noteSalesBrowse`
  alongside the existing keys.
- [ ] **Step 4: The sell dialog.** `SellPositionDialog({ position, onClose })`: a `Field` for the
  ask (`toMinorUnits` parsing with the wallet's error copy), a line naming what the position is
  worth today (principal plus accrued interest, both server figures from the loans response), and
  a submit calling `listNoteForSale(position.lenderNoteId, { askPrice }, { idempotencyKey })`.
  An `ApiError` with code `ASK_EXCEEDS_CURRENT_VALUE` renders inline with the served
  `details.currentValue` formatted; other failures use `messageForError`. Success reports through
  `useFeedback`, invalidates the same keys, closes. Wire into `portfolio.tsx` beside the payoff
  card state.
- [ ] **Step 5: Green:** `pnpm --filter @depawn/marketplace test:unit && pnpm check`
- [ ] **Step 6: Commit:** `feat(marketplace-ui): sell and withdraw a position from the portfolio`

---

### Task 9: Seed, demo parameters, runbook

**Files:**
- Modify: `apps/api/src/infrastructure/parameters/demo-parameters.ts` (`notesTransferable: true`)
- Modify: `apps/api/src/infrastructure/parameters/protocol-parameter-versions.spec.ts:80` if it
  derives from `demoParameters` (read it first; if it builds its own literal, leave it)
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/test/seed.integration.spec.ts`
- Modify: `docs/DEMO.md`

- [ ] **Step 1: Flip the demo default** with the Q-002 rationale in a comment: the demo gate is
  on; production keeps the flag off until securities counsel answers.
- [ ] **Step 2: Seed an open sale.** After the three active loans are built, the lender of the 45
  day loan signs in, reads `/me/loans?role=lender` for its `lenderNoteId`, and lists at roughly 97
  percent of principal through `POST /notes/:id/sales`. Assert one open sale in
  `seed.integration.spec.ts`.
- [ ] **Step 3: DEMO.md** gains a beat: browse Positions for sale, read the chart, buy as another
  member, show the seller's wallet.
- [ ] **Step 4: Run the seed spec:**
  `pnpm --filter @depawn/api exec vitest run --config vitest.integration.config.ts test/seed.integration.spec.ts`
- [ ] **Step 5: Commit:** `feat(seed): put a live position sale in the demo dataset`

---

### Task 10: Playwright

**Files:**
- Create: `e2e/tests/marketplace.secondary-market.spec.ts`

- [ ] **Step 1: Write the spec.** Base `marketplace` project (no clock movement: listing on the
  day of origination means the cap is exactly the principal, so the happy ask stays below it and
  the failure ask sits above it). Seed via API with local helpers copied from
  `marketplace.repayment.spec.ts`: borrower, seller, buyer registered fresh; receipt via
  `staff@demo.test`; funding via `ops@demo.test`; loan of `1000.00` at listing, offer, accept.
  Happy path: seller signs in, Portfolio, `Sell position`, ask `950.00`, sees `Listed for sale`;
  buyer signs in, Browse, tab `Positions for sale`, sees the card
  (`getByTestId('sale-chart')` visible, figures present), `Buy this position`, confirms in the
  dialog, success toast; buyer's Portfolio lending side shows the loan; seller's wallet shows
  `USD 950.00` in. Failure path: seller asks `1,100.00` and the dialog shows the inline cap
  message without listing. Test ids used: `scope-positions`, `sale-chart`, `buy-position`, plus
  ids added in Tasks 7 and 8 (`ask-input`, `sell-submit`, `confirm-purchase` on the dialog
  buttons; add them where missing).
- [ ] **Step 2: Run:** `pnpm test:e2e -- --project=marketplace`
- [ ] **Step 3: Commit:** `test(e2e): a lender exits early and another takes the position`

---

### Task 11: Documentation sweep

**Files:**
- Modify: `docs/02-domain-model.md` (NoteSale entity and state machine after the LenderNote
  section; note that the holder now changes through the sale), `docs/03-ledger-and-money.md`
  (`SELL_NOTE` entry shape, debit buyer available and credit seller available, plus the
  TransferReason note beside the Q-010 release reason), `docs/04-api-contract.md` (replace line
  146's bare transfer with the five endpoints; add the four codes to the canonical list; note the
  sale subsumes the transfer endpoint), `docs/05-frontend.md` (the `/listings/positions` route and
  the portfolio actions), `docs/07-phase-plan.md` (a P8h entry), `docs/10-flows.md` (Flow 18: the
  sale, steps and failure table), `docs/OPEN-QUESTIONS.md` (correct Q-002's implementation note;
  add Q-030 on the borrower buyback exclusion), `docs/superpowers/specs/2026-08-24-secondary-market-design.md`
  (record `NOTE_ALREADY_LISTED` beside the other new codes).

- [ ] **Step 1: Make the edits.** Each doc follows its own established voice; the flow entry
  mirrors Flow 5's structure (actor, steps, failure table naming codes).
- [ ] **Step 2: Prose check the touched files:** `./scripts/check-prose.sh`
- [ ] **Step 3: Commit:** `docs(lending): record the secondary market across the contract docs`

---

### Task 12: Full verification

- [ ] **Step 1:** `pnpm check`
- [ ] **Step 2:** `pnpm test`
- [ ] **Step 3:** `pnpm test:e2e`
- [ ] **Step 4:** Fix anything red, re-run, and only then report the slice done. Commit any fixes
  under their own scoped messages.
