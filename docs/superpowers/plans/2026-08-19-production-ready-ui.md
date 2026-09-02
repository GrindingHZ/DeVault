# Production Ready Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three applications read as finished software: no database values on screen, a page shell instead of a card in a void, tables that survive a narrow window, failure that is caught, and actions that confirm themselves.

**Architecture:** Seven foundation units in `packages/ui` and `packages/contracts`, one backend change to two read models, then a sweep of all twenty four routes onto them. Nothing in the domain, the ports, or any write path is touched.

**Tech Stack:** TypeScript strict, React 19, TanStack Router and Query, Tailwind 3.4, Vitest, Testing Library, NestJS, Prisma, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-08-19-production-ready-ui-design.md`

## Global Constraints

- Tokens only. No raw hex, `rgb()`/`hsl()`, arbitrary Tailwind colour, or hardcoded `font-family` outside `packages/ui/src/tokens.css`. Enforced by `scripts/check-design-tokens.sh`.
- Prose rules apply to comments, docs and UI copy: no em or en dashes, no curly quotes, no ellipsis character, no emoji, no banned phrases. Enforced by `scripts/check-prose.sh`.
- Commits are one line, `type(scope): lowercase imperative summary`, max 72 characters, scope from the list in `scripts/check-commit-msg.sh`. No body, no trailers.
- No `any`, no non-null assertion outside test fixtures, no `as` casts to silence the compiler.
- Money stays `bigint` minor units with an explicit currency. Percentages stay integer basis points.
- An identifier may appear as a secondary reference. It may never be the only thing identifying a person or an item.
- Every `data-testid` currently present must survive, or the E2E suite loses its grip.
- Run `pnpm check` before considering any task complete.

## File Structure

```
packages/contracts/src/
  status-copy.ts             MODIFY  ledger kinds, directions, audit actions
  status-copy.spec.ts        NEW     (no spec file exists for it today)

packages/ui/src/
  date-time.tsx              NEW     DateTime + formatInstant
  date-time.spec.tsx         NEW
  page.tsx                   NEW     Page + PageHeader
  page.spec.tsx              NEW
  data-table.tsx             MODIFY  overflow wrapper + stacked mode
  data-table.spec.tsx        MODIFY
  app-boundary.tsx           NEW     error boundary + not found
  app-boundary.spec.tsx      NEW
  use-mutation-feedback.ts   NEW     toast hook
  use-mutation-feedback.spec.ts NEW
  index.ts                   MODIFY

apps/api/src/
  modules/admin/application/audit-search.query.ts        MODIFY  actorLabel
  modules/custody/application/vault-inventory.query.ts   MODIFY  read model
  modules/custody/http/vault.controller.ts               MODIFY
  modules/admin/http/admin.controller.ts                 MODIFY
packages/contracts/src/operations.ts                     MODIFY  actorLabel
packages/contracts/src/custody.ts                        MODIFY  holderLabel
apps/api/test/identity-labels.integration.spec.ts        NEW

apps/*/src/                  the sweep, one commit per application
apps/admin/src/routes/index.tsx    REWRITE the dashboard
apps/marketplace/src/routes/gallery.tsx  DELETE
```

---

### Task 1: Finish the copy layer

**Files:**
- Modify: `packages/contracts/src/status-copy.ts`
- Test: `packages/contracts/src/status-copy.spec.ts` (new)

**Interfaces:**
- Produces:
```ts
export function nameForLedgerKind(kind: string): string;
export function nameForEntryDirection(direction: string): string;
export function nameForAuditAction(action: string): string;
```

- [ ] **Step 1: Write the failing tests**

Cover all seven ledger kinds (`DEPOSIT`, `HOLD_FUNDS`, `REFUND_HOLD`, `ORIGINATE_LOAN`, `REPAY_LOAN`, `SETTLE_LIQUIDATION`, `WITHDRAW`), both directions, and a sample of the twenty eight audit actions. Two behaviours matter beyond the mapping: an unknown value returns itself rather than throwing, and no result is in screaming snake case, asserted with a regex so a future addition cannot quietly be pasted in raw.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @depawn/contracts test:unit -- status-copy`
Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement**

Follow the existing `nameFrom` helper in the same file. Ledger kinds read as what happened to the reader's money: "Deposit", "Held for an offer", "Hold returned", "Loan funded", "Loan repaid", "Sale settled", "Withdrawal". Directions are "In" and "Out". Audit actions are past tense phrases: `place_offer` becomes "placed an offer".

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(contracts): name ledger kinds and audit actions"
```

---

### Task 2: DateTime

**Files:**
- Create: `packages/ui/src/date-time.tsx`, `packages/ui/src/date-time.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export type DateTimePrecision = 'date' | 'minute' | 'second';
export function formatInstant(iso: string, precision?: DateTimePrecision, locale?: string): string;
export function DateTime(props: {
  readonly iso: string;
  readonly precision?: DateTimePrecision;
  readonly locale?: string;
}): ReactElement | null;
```

- [ ] **Step 1: Write the failing tests**

A valid ISO string formats to the reader's locale, not to ISO. The three precisions differ. The output never contains the `T` separator. An unparseable value renders nothing rather than `Invalid Date`, and `formatInstant` returns an empty string for it. The element is a `<time>` carrying the original ISO in `dateTime`, so the machine readable value survives.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @depawn/ui test:unit -- date-time`

- [ ] **Step 3: Implement**

Mirror `money.tsx`: cache the `Intl.DateTimeFormat` per locale and precision, read the locale from `navigator.language` with an `en-AU` fallback for the server, and let the caller override for tests.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): format an instant for the reader"
```

---

### Task 3: Page and PageHeader

**Files:**
- Create: `packages/ui/src/page.tsx`, `packages/ui/src/page.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export function Page(props: {
  readonly children: ReactNode;
  readonly width?: 'fluid' | 'reading';
}): ReactElement;
export function PageHeader(props: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}): ReactElement;
```

- [ ] **Step 1: Write the failing tests**

`PageHeader` renders its title as an `h1`, because a screen has one and only one. The description and actions are optional and absent when not given. `Page` defaults to fluid width. The reading width is narrower than the fluid width, asserted through the class rather than by measuring, since jsdom has no layout.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

Fluid is `w-full` with a generous `max-w` and horizontal gutter; reading caps around `max-w-3xl`. Vertical rhythm comes from the spacing tokens only.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): give every screen a page header"
```

---

### Task 4: DataTable that survives a narrow window

**Files:**
- Modify: `packages/ui/src/data-table.tsx`, `packages/ui/src/data-table.spec.tsx`

**Interfaces:**
- Consumes: the existing `DataTableColumn<Row>` shape, unchanged.
- Produces: no signature change. Callers gain the behaviour without editing.

- [ ] **Step 1: Write the failing tests**

The table is wrapped in an element carrying `overflow-x-auto`, which is the direct fix for the defect. Every cell in the stacked presentation carries its column header as a label, so a narrow reader is not left with unlabelled values. The empty state still renders when there are no rows, and the column definition is untouched.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @depawn/ui test:unit -- data-table`

- [ ] **Step 3: Implement**

Wrap in `<div className="w-full overflow-x-auto">`. For the stacked mode render the header text into a `data-label` on each cell and reveal it below `md` with a `before:` pseudo element or an explicitly hidden span. Prefer the span: a pseudo element cannot be read by a test and therefore cannot be asserted.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): keep a table readable in a narrow window"
```

---

### Task 5: AppBoundary

**Files:**
- Create: `packages/ui/src/app-boundary.tsx`, `packages/ui/src/app-boundary.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export function AppBoundary(props: {
  readonly children: ReactNode;
  readonly onRecover?: () => void;
}): ReactElement;
export function RouteNotFound(props: { readonly onHome?: () => void }): ReactElement;
export function isUnauthenticated(error: unknown): boolean;
```

- [ ] **Step 1: Write the failing tests**

A child that throws renders the stated failure rather than propagating, and the rest of the shell survives. The failure names a way back. `isUnauthenticated` is true for an `ApiError` with `statusCode` 401 and false for 403, 500 and a plain `Error`, because a forbidden action is not an expired session and must not sign anybody out.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

A class component, because React has no hook form of `componentDidCatch`. `isUnauthenticated` reads `statusCode` structurally rather than importing `ApiError`, so `packages/ui` does not take a dependency on `packages/contracts`.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): catch a render fault and an expired session"
```

---

### Task 6: Mutation feedback

**Files:**
- Create: `packages/ui/src/use-mutation-feedback.ts`, `packages/ui/src/use-mutation-feedback.spec.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: the existing `ToastMessage` and `ToastRegion` from `packages/ui/src/toast.tsx`.
- Produces:
```ts
export function useMutationFeedback(): {
  readonly messages: readonly ToastMessage[];
  readonly reportSuccess: (text: string) => void;
  readonly reportFailure: (text: string) => void;
  readonly dismiss: (id: string) => void;
};
```

- [ ] **Step 1: Write the failing tests**

Reporting a success adds a message with the success tone; a failure adds one with the danger tone. Ids are unique across reports so two identical messages both render. Dismissing removes one and leaves the others.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

`useState` over an array with a counter for ids. No timers: an automatically vanishing message is a message somebody can miss, and the region already renders a dismiss control.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): report both outcomes of a mutation"
```

---

### Task 7: Identity resolution, server side

**Files:**
- Modify: `apps/api/src/modules/admin/application/audit-search.query.ts`
- Modify: `apps/api/src/modules/custody/application/vault-inventory.query.ts`
- Modify: `apps/api/src/modules/custody/http/vault.controller.ts`, `apps/api/src/modules/admin/http/admin.controller.ts`
- Modify: `packages/contracts/src/operations.ts`, `packages/contracts/src/custody.ts`
- Test: `apps/api/test/identity-labels.integration.spec.ts` (new)

**Interfaces:**
- Produces: `actorLabel: string | null` on the audit entry response; `holderLabel: string | null` on the vault inventory row.

- [ ] **Step 1: Write the failing integration tests**

An audit row written by an account resolves to that account's email. One written by staff resolves to the staff identifier. One whose account no longer exists resolves to null, and the row is still returned, because an audit entry must never vanish for want of a join. A vault inventory row carries the holder's email. The inventory endpoint no longer hydrates aggregates: assert the response shape is flat.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @depawn/api test:integration -- identity-labels`

- [ ] **Step 3: Implement**

Audit: collect the distinct account ids in the page and resolve them in one `findMany`, never one query per row. Inventory: replace the aggregate return with a `VaultInventoryReadModel`, which is the correction `docs/01-architecture.md` requires for a list view.

- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Run the boundary check**

Run: `bash scripts/check-boundaries.sh`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(admin): name the actor on every audit row"
```

---

### Task 8: The admin home

**Files:**
- Rewrite: `apps/admin/src/routes/index.tsx`
- Modify: `apps/admin/src/admin-navigation.tsx` if the home link needs a label change

**Interfaces:**
- Consumes: `Page`, `PageHeader` (Task 3), `DateTime` (Task 2), existing admin clients.

Six panels, each from an endpoint that already exists: system state, loan book, exposure by vault, latest reconciliation, dead letters, request metrics. Each states its number and links to the screen that acts on it.

- [ ] **Step 1: Write the failing test**

There is no test harness in the admin app today, so this is asserted in Playwright rather than a unit test: the home shows the trading state, a loan count, and a link to reconciliation, and it no longer contains the words "later phases".

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

Each panel is its own component with its own query, so one failing endpoint degrades one panel rather than the screen. A failed panel says it is unavailable and does not take its neighbours down.

- [ ] **Step 4: Run the suite and the gates**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(admin-ui): replace the placeholder home with the loan book"
```

---

### Task 9: Sweep the marketplace

**Files:** all nine routes under `apps/marketplace/src/routes/`, plus `apps/marketplace/src/market-shell.tsx`. Delete `apps/marketplace/src/routes/gallery.tsx`.

- [ ] **Step 1: Mount the boundary and the toast region in the shell**
- [ ] **Step 2: Convert every route to Page and PageHeader**
- [ ] **Step 3: Replace every raw date with DateTime**
- [ ] **Step 4: Route wallet kinds and directions through the copy layer**

This is the screen the spec singles out: `wallet.tsx` renders `entry.kind` and `entry.direction` straight from the wire.

- [ ] **Step 5: Remove the receipt identifier from the customer view**

The item description is the identity. The identifier stays available where staff need it, which is the vault console, not here.

- [ ] **Step 6: Add success feedback to every mutation**

List, publish, cancel, offer, withdraw, reclaim, accept, repay, deposit, withdraw.

- [ ] **Step 7: Delete the gallery route**

It is a development surface shipping inside the customer application.

- [ ] **Step 8: Run the gates and the E2E marketplace project**

Run: `pnpm check`

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(marketplace-ui): finish the borrower and lender screens"
```

---

### Task 10: Sweep the vault console

**Files:** all eight routes under `apps/vault-console/src/routes/`, plus `console-shell.tsx` and the five intake steps.

- [ ] **Step 1: Mount the boundary and the toast region**
- [ ] **Step 2: Convert every route to Page and PageHeader**
- [ ] **Step 3: Show the holder on the inventory, from Task 7**
- [ ] **Step 4: Replace every raw date with DateTime**
- [ ] **Step 5: Confirm the two irreversible intake steps**

`docs/05-frontend.md` already requires this: sealing and issuing are irreversible and must state plainly what becomes immutable. Today they do not.

- [ ] **Step 6: Add success feedback to seal, issue, verify and release**
- [ ] **Step 7: Run the gates**
- [ ] **Step 8: Commit**

```bash
git commit -m "feat(vault-console): finish the custody screens"
```

---

### Task 11: Sweep the admin

**Files:** the six remaining routes under `apps/admin/src/routes/`, plus `admin-navigation.tsx`.

- [ ] **Step 1: Mount the boundary and the toast region**
- [ ] **Step 2: Convert every route to Page and PageHeader**
- [ ] **Step 3: Render the audit trail with resolved actors and named actions**

From Tasks 1 and 7. This is the screen whose entire purpose is answering who did what.

- [ ] **Step 4: Replace every raw date with DateTime**
- [ ] **Step 5: Add success feedback to pause, unpause, parameter edit, reconciliation run and deposit**
- [ ] **Step 6: Run the gates**
- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin-ui): finish the operations screens"
```

---

### Task 12: Documentation and the responsive gate

**Files:**
- Modify: `docs/05-frontend.md`, `docs/13-design-system.md`, `docs/09-conventions.md`
- Modify: `e2e/tests/accessibility.spec.ts`

- [ ] **Step 1: Extend the axe pass to three widths**

1440, 1024 and 768. The responsive work is otherwise asserted by nobody.

- [ ] **Step 2: Assert no screen shows a bare identifier where a name belongs**

A Playwright check that the audit trail and the inventory contain an email, and that the marketplace receipts screen contains no twenty six character identifier.

- [ ] **Step 3: Correct the admin route list in docs/05**

It lists `/loans`, `/audit`, `/accounts` and `/system`, none of which exist.

- [ ] **Step 4: Record the new conventions**

`Page`, `PageHeader` and `DateTime` in the primitive list. The identifier rule in `docs/09-conventions.md`.

- [ ] **Step 5: Run everything**

Run: `pnpm check && pnpm test`

- [ ] **Step 6: Commit**

```bash
git commit -m "docs(flows): record the page and identity conventions"
```

---

## Self-Review

**Spec coverage.** F1 Task 1; F2 Task 2; F3 Task 7; F4 Task 3; F5 Task 4; F6 Task 5; F7 Task 6; admin home Task 8; the sweep Tasks 9 to 11; error and empty state rules are asserted inside each sweep task; testing Task 12; documentation Task 12.

**Placeholders.** None. Every enum the copy layer must cover is enumerated in Task 1 rather than left as "the ledger kinds".

**Type consistency.** `DateTimePrecision` is defined in Task 2 and consumed in Tasks 8 to 11. `ToastMessage` is the existing type from `toast.tsx`, consumed by Task 6. `actorLabel` and `holderLabel` are named identically in Task 7 and in Tasks 10 and 11.

**Ordering.** Tasks 1 to 7 are independent of each other and can be done in any order. Tasks 8 to 11 all depend on 1 to 7. Task 12 depends on everything.
