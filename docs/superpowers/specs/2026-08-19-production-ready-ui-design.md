# Making the interface production ready

Status: approved in brainstorming, not yet planned
Phase: P8e
Follows: `docs/superpowers/specs/2026-08-19-vault-floor-design.md`

## Why

The product works and does not look finished. A survey of all three applications, screen by screen
against the running demo, found five faults. None of them is the visual design; all of them are the
layer underneath it.

### 1. Raw database values are on customer screens

| Screen | Shows today |
|---|---|
| Marketplace, my receipts | `01M05E9VEERSR5WC0XMVBN9SHR` beneath every item |
| Marketplace, wallet history | `HOLD_FUNDS`, `ORIGINATE_LOAN`, `DEBIT`, `CREDIT` |
| Admin, audit trail | actor `01M05E9SGFSMYVDRCDSEJEF5CA`, action `place_offer` |
| Vault console, inventory | holder `01M05E9SQM75GH2WJ93VQWK7WD` |
| Everywhere | `2026-10-14T08:20:03` |

The repository already holds the idea that an enum is a poor thing to show a person:
`packages/contracts/src/category-copy.ts` says so in a comment, and `status-copy.ts` implements it
for six status enums. The layer simply stops there. Ledger transaction kinds, entry directions,
audit actions, timestamps and account identities never got one.

The audit trail is the sharpest case, because its entire purpose is answering who did what, and it
currently answers with two opaque strings.

### 2. There is no responsive behaviour

Fourteen breakpoint prefixes exist across the whole product, nearly all of them added by the
workspace slice. `DataTable`, which every list screen in all three applications renders through, has
no overflow wrapper, so a table wider than its container pushes the page sideways.

### 3. Content floats in a void

Every screen is a single card pinned to the top left of a viewport that is otherwise empty. There is
no page header pattern, so no screen states what it is, what it is for, or what the primary action
on it might be.

### 4. Dead and stale surfaces

The admin home page reads "The loan book, reconciliation, and parameters arrive with later phases"
while its own navigation links to reconciliation and parameters. The operations application's front
door is a placeholder that contradicts the application around it. A component gallery ships inside
the customer facing marketplace at `/gallery`.

### 5. Nothing catches failure

No error boundary in any application, so a render fault white screens it. No handling of an expired
session, so eight queries fail independently and the reader sees eight inline errors instead of a
login screen. No not found route. `Toast` is built, exported and unit tested, and is used in exactly
one place: the gallery.

## What this is not

The palette is not reopened. The domain, the ports and every write path are untouched. No component
library is added: the primitives needed are few and specific, and a vendored set would need rewiring
to the tokens before it could be used at all.

## Foundations

Seven units. Each is independently testable and each is consumed by the sweep that follows.

### F1. Finish the copy layer

`packages/contracts/src/status-copy.ts` gains, in the same shape as the six naming functions already
there:

```ts
export function nameForLedgerKind(kind: string): string;
export function nameForEntryDirection(direction: string): string;
export function nameForAuditAction(action: string): string;
```

Ledger kinds read as what happened to the reader's money, not as the table that recorded it:
`HOLD_FUNDS` becomes "Held for an offer", `ORIGINATE_LOAN` becomes "Loan funded", `REFUND_HOLD`
becomes "Hold returned". Directions become "In" and "Out" rather than "CREDIT" and "DEBIT", because
a person reading their own wallet is not doing double entry bookkeeping. Audit actions become past
tense phrases: `place_offer` becomes "placed an offer".

An unknown value falls through to itself, exactly as `nameForCategory` already does. A copy layer
that throws on an enum member added later is worse than one that shows the raw value.

### F2. A DateTime component

`packages/ui/src/date-time.tsx`, alongside `Money` and following its rules: formatting happens at
the edge, the reader's locale decides, and the wire format is never shown.

```ts
export function formatInstant(iso: string, options?: DateTimeOptions): string;
export function DateTime(props: { iso: string; precision?: 'date' | 'minute' | 'second' }): ReactElement;
```

Renders inside a `<time dateTime={iso}>` so the machine readable value survives for anything that
wants it. An unparseable value renders as nothing rather than as `Invalid Date`.

### F3. Identity resolution, server side

The rule: an identifier may appear as a secondary reference; it may never be the only thing
identifying a person or an item.

Two read models change.

**Audit.** `AuditEntryReadModel` gains `actorLabel: string | null`. The query resolves it by
`actorType`: an `ACCOUNT` actor resolves to the account's email, a `STAFF` actor to the staff
identifier it already carries. Null when the account no longer exists, which the screen renders as
the raw id, because an audit row must never disappear for want of a join.

**Vault inventory.** `VaultInventoryQuery` currently returns `CustodyReceipt` aggregates for a list
view, which `docs/01-architecture.md` forbids: read models are flat DTOs from a dedicated query
service, never hydrated aggregates. It becomes `VaultInventoryReadModel` with the fields the screen
actually renders plus `holderLabel`. This is a correction to an existing violation, made here
because the identity work touches the same query.

Both are additive on the wire. No existing field changes shape.

### F4. Page and PageHeader

`packages/ui/src/page.tsx`.

```ts
export function Page(props: { children: ReactNode; width?: 'fluid' | 'reading' }): ReactElement;
export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): ReactElement;
```

`width` defaults to fluid, which fills the viewport with a sane maximum and a gutter. `reading` is
for the few screens that are genuinely a column of prose or a single form. Replaces the
`<Card title="...">` as page wrapper pattern that around twenty screens currently use, which is why
every screen today is a bordered box in an empty field.

### F5. DataTable that survives a narrow window

Two changes to `packages/ui/src/data-table.tsx`:

- An `overflow-x-auto` container, which is the direct fix for the defect above.
- A stacked presentation below `md`, where each row becomes a labelled block. A table that only
  scrolls sideways on a phone is technically not broken and practically unreadable, and every column
  already carries a header string to use as the label.

The column definition does not change, so no caller is touched by this beyond gaining the behaviour.

### F6. AppBoundary

`packages/ui/src/app-boundary.tsx`, mounted once per application.

- An error boundary that renders a stated failure and a way back, rather than a white screen.
- A not found component, so a mistyped path is answered rather than blank.
- Session expiry handling: the client already throws `ApiError` carrying `statusCode` and `code`,
  so a `401` becomes a single redirect to login instead of every query on the screen failing
  separately.

The redirect is the part worth being careful with: it fires once per expiry, not once per failed
query, or a reader with eight panes open gets eight navigations.

### F7. Toast, wired

`packages/ui` already exports `ToastRegion`. It gains a small hook so a mutation reports both
outcomes:

```ts
export function useMutationFeedback(): {
  reportSuccess: (text: string) => void;
  reportFailure: (text: string) => void;
  messages: readonly ToastMessage[];
};
```

Mounted in each application shell. Inline `role="alert"` text stays where the error belongs beside a
specific field; the toast carries the outcome of an action whose result is not otherwise visible.

## The admin home

The only piece here that is new product surface rather than repair. Every endpoint it needs already
exists and is already used by another admin screen:

| Panel | Source |
|---|---|
| Trading paused or running, with the reason | `GET /admin/system-state` |
| Loans outstanding, overdue, at risk | `GET /admin/loan-book` |
| Exposure against the insured limit, per vault | `GET /admin/exposure-by-vault` |
| Last reconciliation, and whether it drifted | `GET /admin/reconciliation/latest` |
| Dead letters waiting | `GET /admin/dead-letters` |
| Request volume and duration | `GET /admin/metrics` |

Each panel states the number and links to the screen that acts on it. Nothing is computed in the
browser that the API does not already return. A panel whose query fails renders as unavailable and
does not take the others with it.

## The sweep

Every route moves onto the foundations. Grouped by application so each lands as its own reviewable
commit.

**Marketplace, nine routes.** `Page` and `PageHeader` throughout, `DateTime` everywhere a date is
shown, ledger kinds and directions through the copy layer on the wallet, receipt identifiers removed
from the customer view, toasts on list, publish, cancel, offer, withdraw, reclaim, accept, repay,
deposit and withdraw. `/gallery` is removed from this application: it is a development surface and
it ships to customers today.

**Vault console, eight routes.** Holder identity on the inventory, `DateTime` throughout, the intake
wizard's irreversible steps given the confirmation `docs/05-frontend.md` already requires, toasts on
seal, issue, verify and release.

**Admin, seven routes.** The home replaced with the dashboard above, the audit trail rendered with
resolved actors and named actions, `DateTime` throughout, toasts on pause, unpause, parameter edit,
reconciliation run and deposit.

## Error and empty states

The sweep asserts, per screen, that each of the four states is deliberate:

| State | Rule |
|---|---|
| Loading | A skeleton shaped like the eventual content, never a spinner |
| Empty | Says what would appear here and what causes it to appear |
| Failed | Says what failed and offers the retry, scoped to the pane that failed |
| Forbidden | Reads the same as not found, so a screen cannot be used to discover what exists |

## Testing

Follows `docs/06-testing.md`.

- Unit tests for every new component and every copy function, including the fall through case for an
  unknown enum member and the unparseable date.
- Integration tests for the two changed read models: `actorLabel` resolves for an account actor, for
  a staff actor, and is null for an actor whose account is gone; the vault inventory read model
  carries a holder label and no longer hydrates an aggregate.
- A boundary test that an expired session produces one redirect rather than one per query.
- Playwright: the existing axe pass extended to run at 1440, 1024 and 768 so the responsive work is
  asserted rather than assumed, plus an assertion that no screen renders a bare ULID where a name
  belongs.

## Documentation to update

- `docs/05-frontend.md`: the admin route list is wrong today and lists four routes that do not
  exist. Correct it, and record the `Page` and copy layer conventions.
- `docs/13-design-system.md`: `Page`, `PageHeader` and `DateTime` join the primitive list.
- `docs/09-conventions.md`: the rule that an identifier is never the only identification of a person
  or an item.

## Risks

**The sweep is wide and shallow, which is where regressions hide.** Twenty four routes change
markup. The mitigation is that the E2E suite already drives the important flows by `data-testid`,
and those attributes are preserved; anything that breaks should break loudly in Playwright rather
than quietly in a screenshot.

**The admin dashboard is the one piece with no existing screen to compare against.** It is specified
above in terms of endpoints that already exist so that it cannot quietly grow into a reporting
subsystem.

**Session expiry handling changes behaviour under test.** A 401 currently surfaces as an inline
error that some specs may assert on. Those assertions move to expecting the login screen.
