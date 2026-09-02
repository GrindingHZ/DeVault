# One portfolio, not four lists

Status: approved in brainstorming, not yet planned
Phase: P8g
Follows: `docs/superpowers/specs/2026-08-19-production-ready-ui-design.md`

## Why

The marketplace has four screens for a person's own positions: `/borrow/listings`,
`/borrow/loans`, `/lend/offers` and `/lend/loans`. They are organised by a role split the domain
says does not exist. `docs/00-product-overview.md`:

> Borrower and lender are the same account type with no role gate. Any account may do both.

Two things follow from splitting them anyway.

**Every visit begins with a question nobody should have to answer.** A reader arriving at the
navigation has to decide whether what they want is filed under borrowing or lending before they can
look for it.

**One loan is rendered on two screens.** A loan appears under `/borrow/loans` for the person who
owes it and under `/lend/loans` for the person owed, in different words, from two route files.

The deeper failure is neither of those. It is that the screens list everything flat, so a loan
maturing tomorrow and a loan with three weeks left look identical, and a hold that could be
reclaimed sits silently in a list nobody has a reason to open. Most positions need nothing on any
given day. A few need something today. Nothing in the interface tells them apart.

## The shape

One route, `/portfolio`. Navigation goes from seven destinations to four: Browse, Portfolio, My
items, Wallet.

`/borrow/receipts` survives as **My items**, because an item sitting in a vault is not a position
yet. It becomes one when it is listed.

The four replaced routes redirect into the portfolio with the matching tab selected, so every link
already written and every bookmark still resolves.

## The position model

The centre of this design. Today four screens render four database entities in four vocabularies.
Instead there is one `Position`, and all four map onto it.

```ts
export type PositionSide = 'borrowing' | 'lending';

export interface PositionAction {
  readonly label: string;
  readonly kind: 'publish' | 'accept' | 'withdraw' | 'reclaim' | 'repay' | 'collect' | 'claim';
}

export interface Position {
  readonly id: string;
  readonly side: PositionSide;
  readonly itemDescription: string;
  readonly listingId: string | null;
  /* What is happening, in words a person reads, not a status enum. */
  readonly stage: string;
  readonly tone: StatusTone;
  /* The one number this kind of position turns on. Which number that is
     differs per kind, which is exactly why a shared table could not simply
     print a column. */
  readonly figure: { readonly label: string; readonly value: string } | null;
  readonly action: PositionAction | null;
  readonly needsAttention: boolean;
}
```

The mapping, which is also the test table:

| Source | Stage | Figure | Action | Attention |
|---|---|---|---|---|
| Listing `DRAFT` | Draft | requested principal | Publish | no |
| Listing `ACTIVE` | Taking offers | best rate, or none yet | Accept an offer | no |
| Listing `MATCHED` | Funded | principal | none | no |
| Listing `CANCELLED` / `EXPIRED` | Cancelled / Expired | none | none | no |
| Offer `PENDING` | Standing | your rate | Withdraw | no |
| Offer `SUPERSEDED` / `EXPIRED` | Outbid / Expired | amount held | **Reclaim** | **yes** |
| Offer `ACCEPTED` | Accepted | your rate | none | no |
| Loan owed, `ACTIVE` | Running | owed today | Repay | only near maturity |
| Loan owed, `ACTIVE` past maturity | In grace | owed today | Repay | **yes** |
| Loan owed, `REPAID` | Repaid | none | **Collect the item** | **yes** |
| Loan owed, `DEFAULTED` | Defaulted | principal | none | **yes** |
| Loan lent, `ACTIVE` | Earning | interest accrued | none | no |
| Loan lent, `DEFAULTED` | Defaulted | principal at risk | **Claim the collateral** | **yes** |
| Loan lent, `REPAID` | Settled | interest earned | none | no |

Every row carries its next action. That is what turns four lists into something a person can act
on rather than read.

## The attention rule

Stated once here so it cannot drift into meaning "anything interesting":

**A position needs attention when there is something its holder would regret not doing today.**

That is four cases and no others: money stuck in a reclaimable hold, a loan at or past maturity, a
defaulted loan whose collateral can be claimed, and an item ready to collect. A loan with three
weeks left is not attention. Neither is a listing quietly taking offers.

Near maturity is `maturesAt` within the next day, measured against the server's clock, not the
browser's. See the clock note below.

Most days the band is empty, and a screen that is usually empty is the point rather than a defect.

## Accrued interest, and the clock

"Owed today" needs accrued interest. The loan response already carries the principal, the rate,
`startedAt` and `maturesAt`, and `packages/ui/src/interest.ts` already holds the server's exact
arithmetic, so the figure looks computable in the browser.

It is not. In a demo the server runs its clock weeks ahead of the browser (flow 15), so a client
side accrual would be quietly wrong: a plausible number that does not match what the server would
charge. That is the same class of mistake the offer preview was written to avoid.

So `loanResponseSchema` gains `accruedInterest: Money`, computed server side with the server's
clock by the same `calculateAccruedInterest` the payoff quote uses.

It is named for what it is. **A list figure is not a quote.** The payoff quote endpoint carries
`validUntil` and repayment rejects a stale one; nothing about this field changes that, and the
repay flow still fetches a fresh quote. Calling it `payoffTotal` would invite a reader, and a
future developer, to treat a list row as binding.

## Layout

```
Portfolio
  Borrowed    Owed today    Lent      Accrued     Needs you
  4,000.00    4,059.17      7,200.00  142.18      2

  NEEDS YOU
    Omega Speedmaster    matures in 2 days    [ Repay ]
    Gold bar             outbid               [ Reclaim ]

  All | Borrowing | Lending
    Item                 Side      Stage           Figure     Next
    Tiffany solitaire    borrow    Taking offers   11.00%     Accept
    Omega Speedmaster    borrow    Running         4,059.17   Repay
    Gold bar             lend      Outbid          1,500.00   Reclaim
```

The summary strip shows both sides at once because one person is both. The tab is a filter over
the table, not a filter over the summary: a reader on the Lending tab still wants to know what they
owe.

The tab lives in the URL, like every other selection in this application.

## What this is not

No new endpoints. No change to the domain, the ports, or any write path. The actions in the table
route to the flows that already exist rather than reimplementing them.

## Testing

- The position mapping is a pure function over the four response types, so every row of the table
  above is a unit test, including the stages that carry no action.
- The attention rule gets its own tests, including the cases that must **not** raise it: a loan
  three weeks from maturity, a listing taking offers, a pending offer.
- An integration test that `accruedInterest` on the loan list matches the payoff quote's
  `accruedInterest` for the same loan at the same instant. If those two ever disagree the list is
  lying, and it is the kind of disagreement that would otherwise go unnoticed.
- Playwright: reclaim reached from the attention band, and the four redirects landing on the right
  tab.

## Documentation to update

- `docs/05-frontend.md`: the marketplace route list, and the position model as the reason four
  screens became one.
- `docs/OPEN-QUESTIONS.md`: a note that the borrow and lend split survives as a filter rather than
  as navigation, and why.

## Risks

**The E2E suite drives the old routes.** `my-listings`, `my-offers` and `my-loans` test ids are
asserted in several specs. The redirects keep the paths working; the test ids move onto the
portfolio table and must be preserved, or the suite fails for a reason unrelated to what it tests.

**The summary is four queries merged in the browser.** If any one fails the strip must degrade to
the parts it has rather than disappearing, in the same way the index strip does.

**Attention is a judgement encoded once.** If it starts collecting cases it becomes a second list
of everything, which is what it exists to replace.
