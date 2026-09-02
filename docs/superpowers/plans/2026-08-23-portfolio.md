# One Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four role-split position screens with one portfolio that says what needs doing today and carries every next action inline.

**Architecture:** A pure mapping function turns the four existing response types into one `Position`. The route merges four existing queries client side and renders a summary strip, an attention band and one filterable table. One backend field is added so accrued interest is computed against the server's clock rather than the browser's.

**Tech Stack:** TypeScript strict, React 19, TanStack Router and Query, Tailwind 3.4, Vitest, Testing Library, NestJS, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-portfolio-design.md`

## Global Constraints

- Tokens only. No raw hex, `rgb()`/`hsl()`, arbitrary Tailwind colour, or hardcoded `font-family` outside `packages/ui/src/tokens.css`.
- Four type roles, not two (`docs/DESIGN-BRIEF.md`, P8g amendment): headings and body and labels in `--font-body`, amounts and rates and dates in `--font-figure` which carries `tnum`, and only quoted identifiers such as a receipt reference in `--font-mono`. A figure is compared to the one above it; an identifier is read one character at a time.
- Prose rules apply to comments, docs and UI copy: no em or en dashes, no curly quotes, no ellipsis character, no emoji, no banned phrases. This bites on glyphs too: an HTML numeric entity like the one for a filled square reads as a hex colour to `check-design-tokens.sh`, so use a unicode escape.
- Commits are one line, `type(scope): lowercase imperative summary`, max 72 characters, scope from the list in `scripts/check-commit-msg.sh`.
- No `any`, no non-null assertion outside test fixtures, no `as` casts to silence the compiler.
- Money is `bigint` minor units with an explicit currency. Percentages are integer basis points.
- Colour is never the only signal.
- Every `data-testid` currently present must survive: `my-listings`, `my-offers`, `my-loans`, `my-receipts` are asserted across the E2E suite.
- Run `pnpm check` before considering any task complete.

## File Structure

```
packages/ui/src/
  position-row.tsx            NEW   presentational row, one Position
  position-row.spec.tsx       NEW
  summary-strip.tsx           NEW   the figures across the top
  summary-strip.spec.tsx      NEW
  index.ts                    MODIFY

apps/marketplace/src/portfolio/
  position.ts                 NEW   the Position type and the four mappers
  position.spec.ts            NEW   one test per row of the spec table
  attention.ts                NEW   the attention rule, alone and testable
  attention.spec.ts           NEW
  portfolio-summary.ts        NEW   the four totals, pure
  portfolio-summary.spec.ts   NEW

apps/marketplace/src/routes/
  portfolio.tsx               NEW   the route: four queries, strip, band, table
  borrow.listings.tsx         REWRITE redirect to /portfolio?side=borrowing
  borrow.loans.tsx            REWRITE redirect
  lend.offers.tsx             REWRITE redirect to /portfolio?side=lending
  lend.loans.tsx              REWRITE redirect

apps/marketplace/src/
  market-rail.tsx             MODIFY seven destinations become four

apps/api/src/
  modules/lending/http/lending-response.mapper.ts   MODIFY accruedInterest
  modules/lending/http/lending.controller.ts        MODIFY
packages/contracts/src/lending.ts                   MODIFY
apps/api/test/accrued-interest.integration.spec.ts  NEW
```

---

### Task 1: Accrued interest on the loan list

**Files:**
- Modify: `packages/contracts/src/lending.ts`
- Modify: `apps/api/src/modules/lending/http/lending-response.mapper.ts`, `apps/api/src/modules/lending/http/lending.controller.ts`
- Test: `apps/api/test/accrued-interest.integration.spec.ts` (new)

**Interfaces:**
- Produces: `accruedInterest: MoneyDto` on `loanResponseSchema`.

- [x] **Step 1: Write the failing integration test**

Three cases. A loan an hour old has accrued a figure matching `calculateAccruedInterest` for that
elapsed time. A loan past maturity has stopped accruing, because rule L1 clamps at `maturesAt`. And
the figure equals the payoff quote's `accruedInterest` for the same loan at the same instant, which
is the assertion that matters: if the list and the quote ever disagree the list is lying.

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @depawn/api test:integration -- accrued-interest`
Expected: FAIL, `accruedInterest` is not on the response.

- [x] **Step 3: Implement**

The mapper takes the clock's `now` and calls the same `calculateAccruedInterest` the payoff quote
uses. Do not reimplement the arithmetic. It is named `accruedInterest` and not `payoffTotal`: a list
figure is not a quote, and repayment still fetches a fresh one with `validUntil`.

- [x] **Step 4: Run it and watch it pass**
- [x] **Step 5: Commit**

```bash
git commit -m "feat(lending): carry accrued interest on the loan list"
```

---

### Task 2: The Position model

**Files:**
- Create: `apps/marketplace/src/portfolio/position.ts`, `apps/marketplace/src/portfolio/position.spec.ts`

**Interfaces:**
- Produces:
```ts
export type PositionSide = 'borrowing' | 'lending';
export type PositionActionKind =
  'publish' | 'accept' | 'withdraw' | 'reclaim' | 'repay' | 'collect' | 'claim';
export interface PositionAction {
  readonly label: string;
  readonly kind: PositionActionKind;
}
export interface Position {
  readonly id: string;
  readonly side: PositionSide;
  readonly itemDescription: string;
  readonly listingId: string | null;
  readonly stage: string;
  readonly tone: StatusTone;
  readonly figure: { readonly label: string; readonly value: string } | null;
  readonly action: PositionAction | null;
  readonly needsAttention: boolean;
}
export function positionOfListing(listing: MyListingResponse, now: number): Position;
export function positionOfOffer(offer: OfferResponse, now: number): Position;
export function positionOfBorrowedLoan(loan: LoanResponse, now: number): Position;
export function positionOfLentLoan(loan: LoanResponse, now: number): Position;
```

- [x] **Step 1: Write the failing tests**

One test per row of the table in the spec, fourteen rows. Each asserts the stage in words, whether
there is an action and which kind, and whether it raises attention. Two extra assertions that catch
the failures this model exists to prevent: no stage is a status enum (assert against a screaming
snake case regex), and a loan appears with a different stage and action depending on which side it
is read from.

- [x] **Step 2: Run and watch them fail**

Run: `pnpm --filter @depawn/marketplace test:unit -- position`

This will report that the marketplace app has no test runner. Add one first: copy
`packages/ui/vitest.config.ts`, add `test:unit` to `apps/marketplace/package.json`, and add
`vitest`, `@testing-library/react`, `@testing-library/dom` and `jsdom` to its dev dependencies. The
app has never had unit tests, which is why the position mapping would otherwise have to be tested
through the DOM.

- [x] **Step 3: Implement the four mappers**

Pure functions over the response types. They take `now` rather than reading the clock, so a test
does not have to travel in time and the demo clock cannot leak in.

- [x] **Step 4: Run and watch them pass**
- [x] **Step 5: Commit**

```bash
git commit -m "feat(marketplace-ui): model a position from either side"
```

---

### Task 3: The attention rule

**Files:**
- Create: `apps/marketplace/src/portfolio/attention.ts`, `apps/marketplace/src/portfolio/attention.spec.ts`

**Interfaces:**
- Consumes: `Position` (Task 2).
- Produces:
```ts
export const maturityWarningMs: number;
export function needsAttention(position: Position): boolean;
export function attentionOrder(left: Position, right: Position): number;
```

- [x] **Step 1: Write the failing tests**

The four cases that raise it: a reclaimable hold, a loan at or past maturity, a defaulted loan whose
collateral can be claimed, an item ready to collect.

The cases that must **not** raise it matter more, because this is where a rule like this rots: a
loan three weeks from maturity, a listing quietly taking offers, a pending offer inside its minimum
lifetime, a settled loan. Assert each one false by name.

- [x] **Step 2: Run and watch them fail**
- [x] **Step 3: Implement**

`maturityWarningMs` is one day. The rule reads the `Position`, not the raw responses, so it cannot
quietly grow a fifth source of truth.

- [x] **Step 4: Run and watch them pass**
- [x] **Step 5: Commit**

```bash
git commit -m "feat(marketplace-ui): say which positions need a person today"
```

---

### Task 4: The summary totals

**Files:**
- Create: `apps/marketplace/src/portfolio/portfolio-summary.ts`, `apps/marketplace/src/portfolio/portfolio-summary.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface PortfolioTotals {
  readonly borrowedMinorUnits: bigint;
  readonly owedTodayMinorUnits: bigint;
  readonly lentMinorUnits: bigint;
  readonly accruedMinorUnits: bigint;
  readonly needsAttentionCount: number;
}
export function totalsOf(input: {
  readonly borrowedLoans: readonly LoanResponse[];
  readonly lentLoans: readonly LoanResponse[];
  readonly positions: readonly Position[];
}): PortfolioTotals;
```

- [x] **Step 1: Write the failing tests**

Sums are `bigint` throughout and stay exact past the safe integer range. Only `ACTIVE` loans count
toward borrowed and lent; a repaid loan is not still owed. Owed today is principal plus accrued.
Empty input totals zero rather than throwing.

- [x] **Step 2: Run and watch them fail**
- [x] **Step 3: Implement**
- [x] **Step 4: Run and watch them pass**
- [x] **Step 5: Commit**

```bash
git commit -m "feat(marketplace-ui): total both sides of a portfolio"
```

---

### Task 5: SummaryStrip and PositionRow

**Files:**
- Create: `packages/ui/src/summary-strip.tsx`, `packages/ui/src/summary-strip.spec.tsx`
- Create: `packages/ui/src/position-row.tsx`, `packages/ui/src/position-row.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export interface SummaryFigure {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: 'plain' | 'attention';
}
export function SummaryStrip(props: { readonly figures: readonly SummaryFigure[] }): ReactElement;

export function PositionRow(props: {
  readonly itemDescription: string;
  readonly side: 'borrowing' | 'lending';
  readonly stage: string;
  readonly tone: StatusTone;
  readonly figure: { readonly label: string; readonly value: string } | null;
  readonly actionLabel: string | null;
  readonly onAct?: () => void;
  readonly onOpen?: () => void;
  readonly needsAttention?: boolean;
}): ReactElement;
```

- [x] **Step 1: Write the failing tests**

`SummaryStrip` renders a label and a figure per entry and marks an attention tone with more than
colour. A figure of zero still renders, because an empty space is not a zero.

`PositionRow` leads with the item, states the stage in words, shows the action only when there is
one, and calls `onAct` separately from `onOpen`. Acting must not also open: a reclaim is not a
navigation.

- [x] **Step 2: Run and watch them fail**

Run: `pnpm --filter @depawn/ui test:unit -- summary-strip position-row`

- [x] **Step 3: Implement**

Body face for the words, mono with `tabular-nums` for the figures. The action is a real button
inside the row, and the row itself is a button, so the action stops propagation.

- [x] **Step 4: Run and watch them pass**
- [x] **Step 5: Commit**

```bash
git commit -m "feat(ui): add the summary strip and the position row"
```

---

### Task 6: The portfolio route

**Files:**
- Create: `apps/marketplace/src/routes/portfolio.tsx`
- Modify: `apps/marketplace/src/market-keys.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces: `/portfolio?side=all|borrowing|lending`

- [x] **Step 1: Merge the four queries**

`/me/listings`, `/me/offers`, `/me/loans?role=borrower`, `/me/loans?role=lender`. Each maps through
its own mapper from Task 2 into one array.

- [x] **Step 2: Degrade rather than disappear**

If one query fails the strip shows the totals it can and says which part is unavailable. A failed
offers query must not blank out the loans.

- [x] **Step 3: Render the strip, the band and the table**

The band renders only positions where `needsAttention`, sorted by `attentionOrder`. When it is empty
it renders nothing at all rather than an empty box: a screen that is usually quiet should look
quiet.

- [x] **Step 4: Put the tab in the URL**

`side` as a router search param, validated with Zod, defaulting to `all`. The tab filters the table
and never the strip: a reader on the Lending tab still wants to know what they owe.

- [x] **Step 5: Carry the old test ids**

`my-listings`, `my-offers` and `my-loans` move onto the table so the E2E suite keeps its grip.

- [x] **Step 6: Run the gates**

Run: `pnpm check`

- [x] **Step 7: Commit**

```bash
git commit -m "feat(marketplace-ui): put every position on one screen"
```

---

### Task 7: Redirects and the rail

**Files:**
- Rewrite: `apps/marketplace/src/routes/borrow.listings.tsx`, `borrow.loans.tsx`, `lend.offers.tsx`, `lend.loans.tsx`
- Modify: `apps/marketplace/src/market-rail.tsx`

- [x] **Step 1: Redirect each old route**

`beforeLoad` throwing `redirect` to `/portfolio` with the matching `side`, replacing rather than
pushing so the back button does not bounce through it. Same pattern as
`listings.$listingId.tsx`.

- [x] **Step 2: Cut the rail from seven destinations to four**

Browse, Portfolio, My items, Wallet. The borrow and lend split survives as a filter, not as
navigation.

- [x] **Step 3: Run the gates**
- [x] **Step 4: Commit**

```bash
git commit -m "feat(marketplace-ui): fold the role split into a filter"
```

---

### Task 8: Documentation and end to end

**Files:**
- Modify: `docs/05-frontend.md`, `docs/OPEN-QUESTIONS.md`
- Modify: `e2e/tests/accessibility.spec.ts`
- Create: `e2e/tests/marketplace.portfolio.spec.ts`

- [x] **Step 1: Write the end to end test**

Reclaim reached from the attention band, and each of the four old paths landing on the portfolio
with the right tab selected.

- [x] **Step 2: Point the accessibility routes at the portfolio**

The route list names `/borrow/listings` and friends. They redirect now, so the axe pass would scan
the same screen four times and miss the tab states.

- [x] **Step 3: Update the docs**

`docs/05-frontend.md` gets the new route list and the position model as the reason four screens
became one. `docs/OPEN-QUESTIONS.md` records that the borrow and lend split survives as a filter,
and why.

- [x] **Step 4: Run everything**

Run: `pnpm check && pnpm test`

- [x] **Step 5: Commit**

```bash
git commit -m "docs(flows): record the portfolio and its attention rule"
```

---

## Self-Review

**Spec coverage.** Accrued interest and the clock, Task 1; the position model, Task 2; the attention
rule, Task 3; the summary strip figures, Tasks 4 and 5; layout, Task 6; redirects and navigation,
Task 7; testing and documentation, Task 8. The "what this is not" section needs no task: no new
endpoints beyond the one field, and no write path changes.

**Placeholders.** None. Every mapping case is enumerated in the spec's table, which Task 2 turns
into one test each.

**Type consistency.** `Position`, `PositionSide`, `PositionAction` and `PositionActionKind` are
defined in Task 2 and consumed by Tasks 3, 5 and 6. `PortfolioTotals` is defined in Task 4 and
consumed by Task 6. `StatusTone` is the existing type from `packages/ui/src/status-badge.tsx`.

**One thing the plan adds that the spec did not name:** the marketplace app has no test runner, so
Task 2 stands one up. Without it the position mapping could only be tested through the DOM, which
is the wrong test for a pure function.
