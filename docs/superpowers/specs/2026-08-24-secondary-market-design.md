# The note changes hands

Status: approved in brainstorming, not yet planned
Phase: P8h
Follows: `docs/superpowers/specs/2026-08-23-portfolio-design.md`

## Why

A lender who funds a thirty day loan is locked in for thirty days. The only ways out today are
repayment, default, or waiting. A lender whose circumstances change has no exit, which makes every
offer a heavier commitment than it needs to be, which in turn makes lenders quote wider rates.

The domain was built for this and then the feature was never specified. `docs/02-domain-model.md`
says it plainly:

> The loan does not store the lender's account id. It stores the lender note id. Who is owed money
> is whoever holds the note. This indirection costs one join now and buys the entire secondary
> market later.

Later is now. What exists on top of that indirection is one specced endpoint,
`POST /notes/:id/transfer` in `docs/04-api-contract.md`, feature flagged off. Two problems with it.
First, it was never built; Q-002 in `docs/OPEN-QUESTIONS.md` records it as existing, and that
record is wrong. Second, even as specced it has no payment leg. A transfer without payment is an
assignment, not an exit. The feature a lender needs is a sale: list the position at a price,
another lender pays it, the note moves, the money moves, one transaction.

## The rules of the sale

**Fixed ask, instant buy.** The seller names a price. The first buyer with the balance takes the
whole position atomically. No offers, no holds, no bidding window, because an early exit that
makes the seller wait is not an early exit.

**The ask is capped at current value.** `askPrice <= loan.calculateAmountDue(now)` at the moment
of listing, that is principal plus interest accrued so far. The seller keeps what the position has
earned and forfeits everything it has not. The forfeited remainder of the term's interest is the
buyer's whole reason to buy. The cap only grows as interest accrues, so a sale that was valid when
listed stays valid for its whole life and needs no revalidation at purchase.

**ACTIVE loans only.** A note on a repaid loan is worthless and a note on a defaulted loan is a
claim on collateral, which is a different product priced a different way. When a loan leaves
ACTIVE, any open sale on its note is voided in the same transaction.

**Who may not buy.** The seller, because a sale to yourself is not a sale. The borrower, because a
borrower buying their own debt at a discount is a buyback, a real feature wearing this feature's
clothes, and it is out of scope; see the new open question.

**The gate.** Listing and purchase both require the `notesTransferable` parameter to be on and the
note's own `transferable` field to be true. The parameter is the operational kill switch Q-002
demands; the field is what the note was minted with and is what becomes the Move object's
transferability in Phase 3. The demo parameters turn the switch on and the seed mints transferable
notes. The production default stays off until securities counsel says otherwise.

## The domain

One new entity in the lending module.

```
OPEN ──purchase──▶ SOLD
  │
  ├──withdraw───▶ WITHDRAWN
  │
  └──void───────▶ VOIDED
```

Fields: `id`, `lenderNoteId`, `loanId`, `sellerAccountId`, `askPrice: Money`, `createdAt`,
`status`, `version`.

```ts
class NoteSale {
  static list(note: LenderNote, loan: Loan, askPrice: Money, now: Instant): Result<NoteSale, SaleRejected>;
  withdraw(requestedBy: AccountId): Result<NoteSale, SaleRejected>;
  markSold(): NoteSale;
  markVoided(): NoteSale;
}
```

Invariants:

- The lister holds the note.
- The loan is ACTIVE.
- The note has no other OPEN sale. The entity cannot see other sales, so the use case checks the
  repository and a partial unique index on (`lenderNoteId`) where status is OPEN backs it up.
- `askPrice` is positive, in the loan's currency, and at most `loan.calculateAmountDue(now)`.
- Purchase requires the sale OPEN, the loan still ACTIVE, the holder still the seller, and a buyer
  who is neither the seller nor the borrower.

`LenderNote.holderAccountId` becomes mutable through one repository operation that reassigns the
holder. Nothing else about the note changes; it stays thin by design.

**Voiding.** `RepayLoanUseCase` and the default marking use case void any OPEN sale on their loan
inside the transaction they already run, the same way accepting an offer supersedes the losing
offers. The browse query then never needs to join loan status to hide dead sales, and the seller's
portfolio can say "sale voided" honestly instead of showing an OPEN sale on a closed loan.

**Concurrency.** Purchase locks the loan row exactly as repayment does, so a purchase racing a
repayment serialises on the same lock and the loser sees the truth: the repayer finds the holder
the settlement pays, the buyer finds a loan no longer ACTIVE. The sale row carries `version` for
optimistic concurrency like the loan.

## The money

Purchase settles as one balance checked transfer, buyer available to seller available, amount
`askPrice`. This is the second user to user transfer in the system, which breaks the assumption
`ledger-settlement.adapter.ts` documents: the transfer kind is derived from the participants
because repayment was the only user to user movement. The fix is the one Q-010 already applied to
`releaseHold`: the caller names why money is moving. `TransferCommand` gains a kind, the ledger
gains the kind `SELL_NOTE`, and `docs/03-ledger-and-money.md` records both. New migration for the
enum value. Existing callers pass the kinds the adapter used to derive.

## The API

```
POST   /notes/:id/sales        list the note for sale        { askPrice }
POST   /sales/:id/withdraw     seller withdraws an open sale
POST   /sales/:id/purchase     instant buy at the ask
GET    /market/note-sales      browse open sales, with loan, item, and current value
GET    /me/note-sales          the caller's sales, open and settled
```

New error codes: `NOTE_SALE_NOT_OPEN`, `NOTE_ALREADY_LISTED`, `ASK_EXCEEDS_CURRENT_VALUE`,
`CANNOT_BUY_OWN_POSITION`.
Reused: `NOTE_TRANSFER_DISABLED` when the gate is off, `LOAN_NOT_ACTIVE`, `INSUFFICIENT_FUNDS`,
`FORBIDDEN`, `VALIDATION_FAILED`.

`POST /notes/:id/transfer` stays unbuilt. The sale endpoints subsume it, `docs/04-api-contract.md`
gets amended to say so, and Q-002's implementation note is corrected to match reality.

## The interface

Marketplace app only. No new rail destination; Q-028 settled that argument. The secondary market
is a dedicated page at `/listings/positions`, which keeps Browse lit in the rail, with the browse
workspace and the positions page linking to each other as two faces of one Browse destination.

**The positions page.** One card per open sale: the item, principal, rate, maturity, interest
accrued so far, current value, the ask, and the discount between them, because the discount is the
product. The centre of each card is a value chart, a line from the principal at origination to the
full payoff at maturity, with a marker where the loan stands today and a line at the ask. A buyer
reads three numbers off it at a glance: what the position is worth now, what it will pay at
maturity, and how far below both the ask sits. The browse endpoint returns every figure the chart
needs (principal, rate, start, maturity, accrued, current value, maturity value, ask); the client
only draws, it never computes money.

Buying opens a confirm dialog that names exactly what is paid now and what is owed to the buyer at
maturity.

**Portfolio.** An ACTIVE lending position gains a "Sell position" action. The form shows the live
current value as the cap while the seller types the ask. A listed position shows its ask and a
withdraw action; a voided or sold sale shows as such in the history view.

## Phase 3 mapping

The purchase is one transaction here so it can be one transaction there: a single PTB moves the
coin to the seller and the note object to the buyer, and the cap check moves into the Move module.
The note already lacks public `store` in the migration plan, so the sale function inside the
package is the only path that moves it, which is the on chain form of the same gate.

## Testing

| Level | Cases |
|---|---|
| Unit | Price cap policy at, below, above the cap. Sale state machine legal and illegal transitions. Purchase validation table: wrong holder, closed loan, self buy, borrower buy, gate off. |
| Port contract | Holder reassignment persists and repayment pays the new holder. Transfer with an explicit kind writes that kind. |
| Integration | List then purchase, buyer debited, seller credited, holder changed, one ledger transaction of kind SELL_NOTE. Repayment voids the open sale. Purchase with insufficient funds. Listing above the cap. Listing with the gate off. |
| Playwright | Lender A lists a position, lender B buys it, A's wallet shows the proceeds, the loan appears on B's portfolio lending side. Failure path: an ask above current value is rejected inline with the cap shown. |

## Documents this touches

- `docs/02-domain-model.md`: the NoteSale entity and state machine.
- `docs/03-ledger-and-money.md`: the SELL_NOTE kind and the transfer kind parameter.
- `docs/04-api-contract.md`: the five endpoints, the three codes, the note on the subsumed
  transfer endpoint.
- `docs/05-frontend.md`: the browse tab and portfolio actions.
- `docs/07-phase-plan.md`: P8h.
- `docs/10-flows.md`: the sale flow, happy path and failure table.
- `docs/OPEN-QUESTIONS.md`: correct Q-002, add the borrower buyback question.
- `docs/DEMO.md` and the seed: the demo dataset gains an open sale and the enabled gate.
