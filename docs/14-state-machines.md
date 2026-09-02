# 14: State machines, as documented and as coded

Every entity with a status is a state machine. `docs/02-domain-model.md` draws them and
`docs/10-flows.md` says what each move does to the rest of the world. This file is the third thing:
the graph as the code actually implements it, set beside the graph as written down, so a
disagreement between them is visible rather than discovered.

Read the tables as: **event**, where it may be fired from and to, what has to be true first, and what
else moves in the same transaction. Anything a transition does outside its own aggregate goes
through a port, so the effects column is also the list of things Phase 3 has to reproduce.

A transition with nothing in its **Fired by** column is dead: it exists in the entity, it is drawn in
the documentation, and no code path reaches it. Those are collected at the end.

## CustodyReceipt

```
IN_VAULT ──encumber──────────▶ ENCUMBERED ──releaseEncumbrance──▶ IN_VAULT
   │  ▲                            │
   │  └──claimDefault──────────────┘
   │
   ├──transferHolder─────────▶ IN_VAULT (holder changes)
   ├──burnForRedemption──────▶ RELEASED
   └──burnForLiquidation─────▶ LIQUIDATED
                                  ▲
   ENCUMBERED ──burnForLiquidation┘
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `encumber` | IN_VAULT to ENCUMBERED | holder owns it, not already encumbered | records the loan id on the receipt | `accept-offer` |
| `releaseEncumbrance` | ENCUMBERED to IN_VAULT | none beyond status | clears the loan id | `repay-loan` |
| `claimDefault` | ENCUMBERED to IN_VAULT under the claimant | loan DEFAULTED, caller holds the lender note | holder changes | `claim-receipt` |
| `transferHolder` | IN_VAULT to IN_VAULT | not encumbered | holder changes | **nothing today** |
| `burnForRedemption` | IN_VAULT to RELEASED | holder is the caller, not encumbered | redemption request opens in REQUESTED | `request-redemption` |
| `burnForLiquidation` | IN_VAULT or ENCUMBERED to LIQUIDATED | sale settling | a fresh receipt is issued to the buyer for the same item | `close-liquidation` |

Three disagreements with the drawing in `docs/02`, two of them recorded as Q-012 and undrawn for
months. All three are now drawn:

1. The drawing sends `claimDefault` back to ENCUMBERED with a holder change. The code moves it to
   IN_VAULT under the claimant, which is what lets a lender redeem through flow 6 with no special
   case, and an integration test carries a lender the whole way to prove it.
2. The drawing burns for liquidation only from IN_VAULT. The code allows it from ENCUMBERED too,
   which flow 8 requires: a sale can run before any lender has claimed.
3. `transferHolder` is in the code and in the custody port and appears in no drawing at all. Nothing
   calls it. It is the seam a Phase 3 object transfer would land on.

## Listing

```
DRAFT ──publish──▶ ACTIVE ──acceptOffer──▶ MATCHED
  │                  │
  └──cancel──▶ CANCELLED ◀──cancel──┘
                     │
                     └──expire──▶ EXPIRED
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `publish` | DRAFT to ACTIVE | caller is the borrower, not past its lifetime | `ListingPublished` | `publish-listing` |
| `acceptOffer` | ACTIVE to MATCHED | not expired, offer PENDING and unexpired, inside the loan to value cap | supersedes every other offer, releases the winner's hold into a disbursement and a fee, encumbers the receipt, writes the loan and both notes, `LoanOriginated` and one `OfferSuperseded` per beaten offer | `accept-offer` |
| `cancel` | DRAFT or ACTIVE to CANCELLED | caller is the borrower | supersedes every pending offer, whose holds stay held for their owners to pull, `ListingCancelled` and one `OfferSuperseded` each | `cancel-listing` |
| `expire` | ACTIVE to EXPIRED | past `expiresAt` | supersedes every pending offer, one `OfferSuperseded` each | `expire-listing`, from the sweep |

`expire` was never called for most of the build. Nothing swept listings, and the only scheduled work
in the process was the outbox drain, so a listing past its date sat ACTIVE with the date behind it.
Functionally that was contained, because browse filters on the clock and acceptance refuses with
`LISTING_EXPIRED`. What it cost was that EXPIRED was a state the database could hold and the product
never wrote, and that any screen reading the status alone believed the listing was still taking
offers.

`MarketExpirySweep` now runs beside the outbox drain and writes it down. One transaction per listing,
never one for the batch: forty expiries in one transaction is forty state changes the chain cannot
express as a single call. It reads its candidates outside those transactions and each use case
re-reads under its own lock, so a listing whose borrower cancelled it in between is refused rather
than forced.

`docs/10` flow 2 says cancellation asserts the listing is ACTIVE. The transition table in `docs/02`
and the code both allow it from DRAFT. The code is the better reading, a draft nobody has published
is the easiest thing in the product to change your mind about, so flow 2 is the line to correct.

## Offer

```
PENDING ──accept─────▶ ACCEPTED
   │
   ├──withdraw───────▶ WITHDRAWN
   ├──supersede──────▶ SUPERSEDED
   └──expire─────────▶ EXPIRED
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `accept` | PENDING to ACCEPTED | through `Listing.acceptOffer` | hold released into the origination | `accept-offer` |
| `withdraw` | PENDING to WITHDRAWN | caller is the lender, past the minimum offer lifetime | hold refunded, `OfferWithdrawn` | `withdraw-offer` |
| `supersede` | PENDING to SUPERSEDED | another offer was accepted, or the listing was cancelled | the hold stays held, `OfferSuperseded` | `accept-offer`, `cancel-listing` |
| `expire` | PENDING to EXPIRED | past `expiresAt` | none. The hold stays held | `expire-offer`, from the sweep |

The hold is a second dimension this graph does not show, and the pair is the whole of rule M8. A
superseded offer keeps its status forever, because superseded is what happened to it, and the money
comes back only when its owner pulls it:

```
offer:  PENDING ──supersede──▶ SUPERSEDED ─────────────▶ SUPERSEDED (unchanged)
hold:   HELD    ─────────────▶ HELD       ──reclaim───▶ REFUNDED
```

`reclaim-hold` refunds without writing anything to the offer, deliberately. The consequence is that
the offer status alone cannot answer whether there is money left to ask for, which is why
`GET /me/offers` now carries the hold state. Reading the status alone was a row that went on asking
for money already home and a notification that could never be cleared.

`expire` was dead here for the same reason as the listing, and the code said so out loud:
`reclaim-hold` accepts an expired PENDING offer and its comment called the lazy status harmless. It
was harmless to the api. It was not harmless to the screen, which read PENDING as standing.

The sweep does offers before listings, which decides which of the two words a beaten offer gets. An
offer that ran out under a listing that has not is EXPIRED, its own fate. One still standing when its
listing runs out is SUPERSEDED, the listing's. Both leave the money exactly where it was.

## Loan

```
ACTIVE ──repay────────▶ REPAID
   │
   └──markDefault─────▶ DEFAULTED ──liquidate──▶ LIQUIDATED
                            │  ▲
                            └──┘ claimReceipt (holder of the collateral changes)
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `repay` | ACTIVE to REPAID | caller is the borrower, quote not stale, payment covers the total | pays the current note holder, releases the encumbrance, voids any open note sale, `LoanRepaid` | `repay-loan` |
| `markDefault` | ACTIVE to DEFAULTED | caller holds the lender note, grace has ended | records `defaultedAt`, voids any open note sale, `LoanDefaulted` | `mark-default` |
| `claimReceipt` | DEFAULTED to DEFAULTED | caller holds the lender note | receipt moves to the claimant, `ReceiptClaimedByLender` | `claim-receipt` |
| `liquidate` | DEFAULTED to LIQUIDATED | sale closing | waterfall pays the note holder first, then the fee, then the surplus to the borrower | `close-liquidation` |

This one matches its drawing exactly. Worth noting what the graph deliberately does not carry: who
is owed. That lives on the lender note, which is why repayment resolves the holder inside its own
transaction and why the secondary market can change it without the loan moving at all.

## NoteSale

```
OPEN ──purchase──▶ SOLD
  │
  ├──withdraw────▶ WITHDRAWN
  └──void────────▶ VOIDED
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `purchase` | OPEN to SOLD | loan ACTIVE, holder still the seller, buyer is neither the seller nor the borrower, transfers enabled | buyer pays the seller (`SELL_NOTE`), the note holder becomes the buyer, `NoteSold` | `purchase-note-sale` |
| `withdraw` | OPEN to WITHDRAWN | caller is the seller | none, `NoteSaleWithdrawn` | `withdraw-note-sale` |
| `void` | OPEN to VOIDED | its loan closed | none, `NoteSaleVoided` | `repay-loan`, `mark-default` |

Matches its drawing. The interesting property is that `void` is fired by another aggregate's use
case, inside that use case's transaction, which is what stops the market advertising a claim on a
loan that has stopped paying.

## Liquidation

```
SCHEDULED ──open──▶ BIDDING ──close──▶ SETTLED
    │
    └──cancel──▶ CANCELLED
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `open` | SCHEDULED to BIDDING | operations | sets `opensAt` and `closesAt`, `LiquidationOpened` | `open-liquidation` |
| `bid` | BIDDING, no status change | inside the window, at or above the reserve, above the standing high bid | holds the bidder's funds. The beaten bid stays held for its owner to pull | `place-bid` |
| `close` | BIDDING to SETTLED | at least one bid | releases the winning hold across the waterfall, burns the receipt and issues the buyer one for the same item, marks the loan LIQUIDATED, `LiquidationSettled` | `close-liquidation` |
| `cancel` | SCHEDULED to CANCELLED | operations | audit entry carrying the reason, the loan's sale slot is freed, `LiquidationCancelled` | `cancel-liquidation` |

`docs/02` drew `cancel` hanging off BIDDING. The code allows it only from SCHEDULED, and the code is
right: cancelling an auction that has live bids would have to refund every hold on it, and nothing
does that in bulk. The drawing has been corrected rather than the table.

Cancelling used to be unreachable, which made CANCELLED a state the schema could hold and the product
could not enter. `POST /liquidations/:id/cancel` now reaches it, operations only, and demands a
reason for the audit entry, because cancelling reverses an operations judgement and the record has to
say why.

Reaching it exposed a second thing. `liquidation.loan_id` was plainly unique, so a cancelled sale
would have held the loan's only slot for ever and the loan could never have been sold again: a
cancel that bricks its loan is worse than no cancel at all. The index is now partial on
`status <> 'CANCELLED'`, the same shape as the one open sale per note, and `findByLoan` reads the
live one. A called off sale leaves the loan exactly where it found it.

## RedemptionRequest

```
REQUESTED ──verify──▶ VERIFIED ──release──▶ RELEASED
```

| Event | From, to | Guard | Effects | Fired by |
|---|---|---|---|---|
| `verify` | REQUESTED to VERIFIED | staff | audit entry naming the staff member | `verify-redemption` |
| `release` | VERIFIED to RELEASED | staff, seal number recorded | vault exposure falls, `ItemReleased` | `confirm-release` |

Matches. The receipt burns at **request** time rather than here, which is worth restating because it
reads like a bug and is not: the burn is the entitlement proof and the counter visit is identity
verification (flow 6). A receipt reading RELEASED with a request still REQUESTED is therefore
correct, and the two are merged before anything is shown.

## What this audit found

Ordered by what it costs.

**1. A beaten bidder could not get their money back from any screen. Fixed.** `place-bid` holds funds
and leaves a beaten bid held, pull not push, the same as an offer.
`POST /liquidations/:id/bids/:id/reclaim` existed and `reclaimBid` was in the contracts client, but
no application called it, and the portfolio modelled listings, offers, loans and note sales, never
bids. The money was held, no row showed it and the bell could not count it: the exact failure the
attention band was built for, in the one place it did not reach.

`GET /me/bids` now answers what a bidder has bid and, separately, whether the money behind it is
still committed. The bid cannot say that on its own, for the same reason a superseded offer cannot:
reclaiming refunds the hold and writes nothing back. `positionOfBid` turns each into a row on the
lending side, so a beaten bid raises attention with a Reclaim funds control until the money is
home.

**2. `docs/OPEN-QUESTIONS.md` Q-006 recorded a decision that was not implemented. Fixed.** It said
the winning bidder receives a newly issued receipt for the same item. `close-liquidation` burned the
old receipt and issued nothing, so after a sale the buyer held no representation of the item at all:
they owned a thing the product could not name and no flow could release to them.

`CustodyPort.reissueToBuyer` now does both halves in one operation, which is what it is: the item
never leaves the vault, only the paper changes hands. The buyer's receipt lands `IN_VAULT` under
them, carrying every descriptive field across including the intake record hash, so it shows the same
photograph and serial numbers and collecting it is flow 6 with no special case. The port contract
suite carries it, so a Phase 3 adapter has to destroy the old object and mint the new one too.

Reaching it needed the same kind of unpicking as the cancel did. `custody_receipt.intake_record_hash`
was plainly unique, which forbade an item carrying a burned receipt and a live one at once. The index
is now partial on the live statuses: the invariant that matters is one live receipt per item, and a
burned receipt is history rather than a competitor.

**3. Three transitions were drawn and coded and never fired. Fixed.** `Listing.expire`,
`Offer.expire` and `Liquidation.cancel`. The third gained an endpoint, above. The first two gained
`MarketExpirySweep`, which runs beside the outbox drain and does nothing except write down what the
clock already decided: no guard changes, because every guard already read the clock, and no money
moves, because a hold on a beaten or expired offer is pull and not push either way.

`CustodyReceipt.transferHolder` is a fourth and stays unfired on purpose. It is the seam a Phase 3
object transfer lands on, it is covered by the custody port contract suite so any adapter has to
implement it, and nothing in Phase 1 has a reason to call it. Unfired is the correct state for a seam;
what made the other three defects was that the product needed them and could not reach them.

**4. Five state changes emitted no event. Fixed, and it was six.** A cancelled listing, a superseded
offer, a scheduled liquidation, an opened one, a cancelled one, and the receipt a sale now issues to
its buyer. `docs/08` has the Phase 3 indexer rebuilding state from events, so every one of those was
a change it would never have seen: a listing still taking offers after its borrower called it off, a
sale that never opened, a vault holding an item nobody owns.

`ListingCancelled`, `OfferSuperseded`, `LiquidationScheduled`, `LiquidationOpened` and
`LiquidationCancelled` join the union, and `close-liquidation` announces the buyer's receipt as the
`ReceiptIssued` it is. `OfferSuperseded` is published one per beaten offer rather than one carrying a
list, because an indexer folds per aggregate and an offer is its own aggregate.

What none of them says is that money moved. A superseded hold stays held until its owner pulls it
(rule M8), and an indexer reading supersession as a refund would show lenders a balance they do not
have. The tests assert the events exist; the flow 9 tests assert the money does not move until
somebody asks.

**5. The `docs/02` drawings were stale in three places. Fixed.** The receipt's `claimDefault` target
and its liquidation burn, both argued out in Q-012 and never redrawn, and the liquidation `cancel`
arrow hanging off the wrong state. All three now match the code, and each carries the sentence saying
why the code is the right reading.

None of these was a live money defect. The ledger balances, every guard holds, and no transition can
be fired from a state that forbids it. Finding 2 was the closest to one: no money went astray, but an
item did, in the sense that nobody could point at who owned it. What they were is a set of places where the map and the ground
disagreed, which is the kind of thing that is cheap now and expensive at the Move rewrite, when the
map is what somebody will build from.

Finding 1 was the exception in one respect: no money was lost, but money was stranded, and the
product had no way to say so. Three holds in the demo dataset were sitting exactly like that.

Left open on purpose: finding 2, which needs a founder decision rather than code, and finding 4,
whose four missing events matter from P9 when the indexer exists and are speculative before it.
