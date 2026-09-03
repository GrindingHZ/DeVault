# 05: Frontend

## Three applications, one shared package

| App | Users | Roles |
|---|---|---|
| `apps/marketplace` | Borrowers and lenders | `MEMBER` |
| `apps/vault-console` | Vault staff, appraisers | `VAULT_STAFF` |
| `apps/admin` | Operations, compliance | `OPERATIONS`, `COMPLIANCE` |

Borrowing and lending are the same app with no role gate, because the same person will do both and a
role switch would be friction with no security benefit. The vault console is separate because it is
used on a fixed terminal by staff with a different threat model and a very different interaction
style: barcode scanners, cameras, printed labels, no marketing chrome.

`packages/ui` holds design tokens, primitives (Button, Field, Money, StatusBadge, DataTable), and the
authenticated shell. It is built in P0.5, before any product slice, per `docs/13-design-system.md`. Feature components stay in their own app. Do not promote a component to
`packages/ui` until a second app needs it.

## Stack

- Vite, React 19, TypeScript strict
- TanStack Router: file-based routes, typed params, typed search params
- TanStack Query: all server state
- React Hook Form + the Zod schemas from `packages/contracts`
- Tailwind, extending the shared preset in `packages/ui/tailwind.preset.ts`

Colour, typography, spacing, and density are owned by `docs/13-design-system.md` and fixed in
`packages/ui/src/tokens.css`. Nothing in this document overrides that. No app file contains a raw
colour, font family, or pixel spacing value; `scripts/check-design-tokens.sh` enforces it.

## State rules

**Server state lives in TanStack Query. Nothing else.** No Redux, no Zustand for anything that came
from an API. If you find yourself copying query data into local state, you are about to create a
staleness bug.

Local state is for: form drafts, modal open/closed, table sort, filter panel expansion.

Query keys are built by a typed factory, never string-concatenated inline:

```ts
export const listingKeys = {
  all: ['listings'] as const,
  browse: (filters: BrowseFilters) => [...listingKeys.all, 'browse', filters] as const,
  detail: (id: ListingId) => [...listingKeys.all, 'detail', id] as const,
  offers: (id: ListingId) => [...listingKeys.detail(id), 'offers'] as const,
};
```

After a mutation, invalidate by the narrowest key that is actually stale. Blanket
`invalidateQueries()` hides bugs and makes the app feel slow.

## The API client

One generated-by-hand typed client in `packages/contracts/src/client`. Every method takes and returns
the inferred Zod types. There is no `fetch` call anywhere in a component.

```ts
export async function placeOffer(
  listingId: ListingId,
  body: PlaceOfferRequest,
  options: RequestOptions,
): Promise<PlaceOfferResponse>;
```

`RequestOptions` carries the idempotency key. Every mutation hook generates one with `crypto.randomUUID()`
on mount, not on submit, so a double-click sends the same key twice and the server deduplicates.

## Rendering money and rates

Two primitives, used everywhere, never bypassed.

```tsx
<Money value={loan.principal} />                  // USD 2,500.00
<Rate basisPoints={loan.annualPercentageRateBasisPoints} />   // 18.00% p.a.
```

`Money` takes the `{ minorUnits: string, currency }` shape straight from the API and does its own
`Intl.NumberFormat`. There is no place in the app where an amount is a JavaScript `number`.

`Money` leads with the currency: Circle's mark for USDC and the code for anything else, through
`CurrencyMark`. The mark is an svg asset in `packages/ui/src`, carrying Circle's colours under the
same exemption the favicon has, and it sizes to the text beside it. `formatMoney` keeps the code in
the string for an aria label or a toast. A screen that sets its own figure, such as the wallet or
the header pill, puts `CurrencyMark` in front of the bare amount rather than spelling the coin.

## Marketplace app routes

```
/                              landing, live listings
/listings                      the workspace: browse, detail, offer book, spine, tape
/secondary-market              open note sales, each with a value chart
/listings/:listingId           redirects into /listings?listing=:listingId
/portfolio                     every position on both sides, filtered by ?side=
/borrow/receipts               my receipts, list one
/borrow/redemptions            redemption requests and their status
/borrow/listings               redirects into /portfolio?side=borrowing
/borrow/loans                  redirects into /portfolio?side=borrowing
/lend/offers                   redirects into /portfolio?side=lending
/lend/loans                    redirects into /portfolio?side=lending
/wallet                        balance, ledger history, deposit, withdraw
/settings
```

The navigation rail carries five destinations: Browse, Secondary Market, Portfolio, My items,
Wallet. The Secondary Market earns its place on the rail because it is a different market, not a
different view of the reader's own things; the Q-028 consolidation was about role splits and holds.

Screens that need care:

**Listing detail.** Shows the appraisal, category, vault, photos, the offer book ranked by total
borrower cost, and the LTV cap as a hard ceiling on the offer form. The form must show the borrower's
requested principal as the default and make the rate the thing the lender competes on. Disable submit
above the cap client-side and let the server reject it too.

Under the best rate sits what the chain holds for the listing, each record named and linked to the
explorer: the pledge, the vault receipt wrapped inside it, and the borrower's address. The offer
book carries a column for each offer's hold, so the money behind a rate can be seen locked rather
than taken on the book's word. The rate slider moves in half percent notches; the box beside it
takes any rate the contract accepts.

**Payoff and repay.** Fetch the quote, show a countdown to `validUntil`, refetch on expiry. Submitting
sends `quotedAt`. If the server returns `PAYOFF_QUOTE_STALE`, refetch and show the new figure rather
than silently retrying; the amount changed and the user must see it.

**Reclaim funds.** A persistent banner when the account has superseded or expired holds. This is
money the user cannot spend and does not know about. It should be impossible to miss.

**Secondary Market.** Its own rail destination beside Browse. One card per open sale, and the centre of each
card is a `ValueChart`: the solid line runs from the principal at origination to the full payoff at
maturity, a marker pins today, and the dashed reference line is the ask. Every figure on the chart
is priced by the server; the client draws and never computes money. Buying opens a dialog naming
what is paid now and what the loan pays at maturity. Selling and withdrawing live on the
portfolio's lending rows, where an active position offers `Sell position` and a listed one shows
its ask beside `Withdraw sale`.

## The portfolio

`/portfolio` replaced four screens: my listings, my loans, my offers and funded loans. The four were
the same question asked in four vocabularies, and they made one loan appear twice under two
different names depending on which door the reader came through. A person who both borrows and
lends had to navigate to assemble a picture they should have been handed.

They are one table now. The unit is a **position**: something the reader holds, on one side of the
market, at one stage, with at most one thing to do about it. Four mappers in
`apps/marketplace/src/portfolio/position.ts` turn a listing, an offer, a borrowed loan and a lent
loan into that one shape. Every mapper takes `now` as a parameter rather than reading a clock, so a
test does not travel in time and the demo clock cannot leak in.

The screen has two axes, and neither is a filter over one list.

**Side** picks borrowing or lending. **View** picks open or history. Four combinations, and each
draws its own columns, because the questions differ: a borrower is shown what a loan is costing
(interest so far, interest to come, owed today), a lender what it is returning (earned, still to
earn, at maturity), and a closed row is shown what it was worth and how it ended. Running the open
columns over closed rows put a dash under the interest, the settlement and the term on every line,
which is what made the earlier arrangement of two tables per side look arbitrary.

That earlier split was by entity: loans in one table, listings and offers in the other. It was the
same mistake the portfolio exists to end, only smaller, and it asked a reader to work out which of
their own things belonged where. A listing and the loan it becomes are one story, and they now sit
in one table.

It is two screens, not one with a filter. Borrowing and lending answer different questions with
different columns: a borrower is shown what a loan is costing (interest so far, interest to come,
owed today) and a lender is shown what it is returning (earned so far, still to earn, value at
maturity). The one merged table had to drop every column that did not apply to both, which left it
saying almost nothing. `side` and `view` both live in the URL and default to borrowing and open.

Every row carries a photograph and a term. A person recognises their own things by sight long
before they read a description, which is why the browse rail leads with one and the portfolio now
does too. The term is how long is left, whatever the row is: a loan runs to maturity and gets a bar,
a listing and an offer run to an expiry with no recorded start and get the words alone, and a closed
row gets a dash like every other column with nothing true to say.

The loan term bar Its arithmetic runs against `asOf` on the loan list response,
which is the server's clock: the demo runs weeks ahead of any browser (flow 15), so a bar drawn
against `Date.now()` would report a matured loan as three percent through.

The status column carries a legend. Every word it can show is defined once in
`apps/marketplace/src/portfolio/stages.ts`, keyed by side, and both the mappers and the legend read
from there. A test asserts the two directions: every stage a mapper produces is explained, and no
stage is explained that no mapper produces. The split by side is not ceremony, it is the point:
`Sold` is a disaster to the borrower and a payout to the lender, so the two sides get different
tones and different sentences for the same word.

Three rules hold the screen together:

- **The stage is words, never a status enum.** `IN_VAULT` and `SUPERSEDED` are correct names for a
  state machine and the wrong thing to say to a person.
- **What needs a person lives in the header, not on the screen.** A bell carries the count and the
  list behind it; the portfolio shows positions, not urgency. It was a band across the top of the
  portfolio, which put the one thing a reader would regret not doing on the one screen they had to
  remember to open, and it duplicated a reclaim banner that shouted on every screen about held money
  and knew about nothing else. Both are gone.
- **The bell is empty most days.** A position needs attention only when its holder would
  regret not acting today: a hold that lost and is sitting there, a loan at or past maturity, a
  defaulted loan whose collateral can still be claimed, an item repaid for and waiting in a vault.
  The rule is stated once, in `portfolio/attention.ts`, so it cannot drift into meaning "anything
  interesting". When the band is empty it renders nothing at all rather than an empty box.
- **The tab filters the table and never the strip.** A reader on the Lending tab still wants to know
  what they owe. `side` lives in the URL like every other part of the view.

The strip sums only outstanding loans. A repaid loan is history, and counting it would inflate both
sides forever. Interest comes from the server as `accruedInterest` on the loan: the demo clock runs
weeks ahead of the browser, so a figure computed here would be silently wrong.

## The marketplace header

Four things, in the order they are read: the brand, what needs you, what you can spend, who you are.

The balance is a pill rather than a row of labelled figures. Both balances spelled out was two
thirds of the wallet screen wedged beside the product name; the menu behind the pill still has the
held figure, and the pill shows a dot when it is not zero, because that is when it explains why the
spendable number looks wrong.

Log out is behind the avatar. As a bare button in the header it gave the most destructive control on
the screen the same weight as everything beside it, and never said whose session it would end.

Every panel in the product opens through one `Popover`: click rather than hover, escape closes and
returns the focus, and the panel is portaled out of whatever container would otherwise clip it. It
carries the `data-surface` of the element it was triggered from, because leaving for the document
body also leaves the palette scope, and the marketplace floor's panels opened white on a dark screen
until they did.

## The marketplace workspace

`/listings` is one screen rather than several. The panes are separate components and the selection
that binds them is a router search param, never React state:

```
/listings?listing=&category=&maxLoanToValue=&sort=&density=&stage=&offer=
```

The rail answers one question in three parts: **Browse items** is other people's, **My offers** is
what the reader has money against, **My listings** is their own. "All items" mixed all three, which
padded the lender's tab with rows nobody could act on and gave a borrower nowhere to look.

Each row carries the amount asked for, the closing date and a banded meter for the share of the
category's allowance the loan has taken. The meter runs green to red across the whole allowance, so
a reader can see how well covered a listing is before reading a figure; the percentage sits beside
it, because colour is never the only carrier. The rate stays plain: a low rate is what a borrower
wants and what a lender is beaten down to, and one row renders for both, so colouring it would tell
half the readers the opposite of the truth.

The closing date is a date, not a countdown. "71 days left" is a number a reader has to turn back
into a date before deciding anything, and it was being computed against the browser's clock rather
than the server's. It takes a warning tone inside its last week.

How the rail is laid out is a pair of icon toggles on the bar beside the filter, not a menu item
three clicks inside it: it changes what the reader is looking at rather than what is in the list.
The gallery is two across at every width, and the rail cannot be dragged below the width two
readable tiles need.

Every pane reads the router. None of them is handed the selection by a parent and none of them
tells another pane anything. That is what makes each one renderable on its own in a test, and it is
also what gives the screen a working back button, a reload that restores the view, and a link
somebody can send.

The old per listing route still exists and redirects, so every link written before the workspace,
every bookmark, and the demo runbook all still resolve.

Two rules the panes share:

- **Tone is bound to the reader, not to the arithmetic.** A falling rate is favourable to a borrower
  and adverse to a lender. `MarketDelta` takes a role and the direction arrow is computed
  separately from the colour. See flow 17 in `docs/10-flows.md`.
- **Which role the reader is in is derived, never chosen.** `positionOf` reads their relationship to
  the listing. There is no toggle, because a toggle is a piece of state a person can leave in the
  position that tells them the opposite of the truth.

## Vault console routes

```
/intake                        start a new intake
/intake/:intakeId              the wizard
/inventory                     everything in this vault, filterable by status
/inventory/:receiptId
/releases                      queue of redemption requests awaiting release
/releases/:requestId           verify identity, then confirm release
/exposure                      insured limit vs current exposure
```

The intake wizard is a linear stepper with a persisted draft: identify, photograph, test and
authenticate, appraise, seal, review, issue. Each step saves to the server. The final two steps are
irreversible and must have a confirmation that states plainly what becomes immutable.

Design for the environment: large touch targets, high contrast, works at 1366×768, keyboard-first,
and every screen usable without a mouse.

## Admin app routes

```
/                              the dashboard: trading, loan book, exposure,
                               reconciliation, dead letters, traffic
/liquidations                  defaulted loans and the sales against them
/operations                    pause and unpause, and the audit trail
/parameters                    protocol parameters, with an effective date and history
/reconciliation                latest run, drift items, run now
/deposits                      credit an account from the platform float
```

The reconciliation screen is the most important one in the entire product. It shows, for each vault,
three numbers that must agree: physical inventory count, database receipt count, and (in Phase 3)
on-chain receipt count. Any disagreement is a red row with a drill-down. Build it in Phase 1 with two
columns and add the third in Phase 3.

## Screens are pages, not cards

Every screen is a `Page` with a `PageHeader`. Before P8e each one was a `Card` used as a page
wrapper, which is why they all rendered as a bordered box in the top left of an empty window and
why none of them had a heading.

`Page` defaults to a fluid width. `reading` is for a screen that is genuinely one form or one
column of prose. `PageSection` is a band underneath, and carries the `h2` if it has a title; the
`h1` belongs to the header and there is one per screen.

## Nothing on screen is in the shape the database stores it

Three rules, all of them broken somewhere before P8e:

- An enum reaches a person through `packages/contracts/src/status-copy.ts`. Nothing renders a
  status, a ledger kind, a direction or an audit action straight from the wire.
- A timestamp reaches a person through `DateTime`. Nothing renders an ISO string.
- An identifier may be a secondary reference and may never be the only thing naming a person or an
  item. Where a screen needs one to be quotable, it shows a short tail and keeps the whole value in
  the title.

The audit trail is the case that made this a rule: its entire purpose is answering who did what,
and it answered with an account id and a snake case identifier.

## Every application catches its own failures

`AppBoundary` is mounted once per shell. A render fault shows a stated failure and a way back
rather than a white page, and an expired session redirects once rather than failing every query on
the screen separately. A `403` is not a `401`: being refused an action is not being signed out.

## Every mutation reports both outcomes

`useMutationFeedback` in the shell, `useFeedback` in the screen. Inline `role="alert"` text keeps
its job for an error that belongs beside a field; the toast carries the outcome of an action whose
result is not otherwise visible.

## Component conventions

- One component per file, named export, file named after the component in kebab-case.
- Components receive data as props. Only route-level components and container components call hooks
  that fetch. This keeps presentational components testable without a query client.
- No component over roughly 150 lines. Past that, extract a subcomponent or a hook.
- Every loading state is a skeleton matching the final layout, not a spinner. Every error state is a
  message keyed off the error `code` from `packages/contracts`.
- No `useEffect` for data fetching. Ever. That is what TanStack Query is for.
- Forms: schema from `packages/contracts`, resolver from `@hookform/resolvers/zod`. Field-level errors
  come from the schema; form-level errors come from the API error `code`.

## Accessibility floor

Not optional and not a later phase. Labels on every input, focus visible, a logical tab order,
`aria-live` on the toast region, and colour never the sole carrier of status; every badge has text.
Playwright runs `@axe-core/playwright` on each primary route and fails on serious violations.

## What Phase 3 changes in the frontend

Very little, which is the point.

- A wallet connection replaces the password login on the marketplace app. `@mysten/dapp-kit-react`.
- Mutations that were "call API, get response" become "call API for unsigned transaction bytes, sign
  in wallet, submit, poll for confirmation". This is a change to the mutation hooks, not the screens.
- `settlementRef.reference` starts rendering as an explorer link when `settlementRef.kind === 'chain'`.
  Write the component that way in Phase 1 with the chain branch unreachable.
- A "confirming" state appears between submission and indexer catch-up. Design the status badges in
  Phase 1 with a `PENDING_CONFIRMATION` variant that Phase 1 never emits.

The vault console and admin app change almost not at all; staff will keep using session auth.
