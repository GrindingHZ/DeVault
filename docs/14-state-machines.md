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
| `transferHolder` | IN_VAULT to IN_VAULT | not encumbered | holder changes | nothing today |
| `burnForRedemption` | IN_VAULT to RELEASED | holder is the caller, not encumbered | redemption request opens in REQUESTED | `request-redemption` |
| `burnForLiquidation` | IN_VAULT or ENCUMBERED to LIQUIDATED | sale settling | vault exposure falls | `close-liquidation` |

Three disagreements with the drawing in `docs/02`, two of them already recorded as Q-012 and still
undrawn:

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
| `acceptOffer` | ACTIVE to MATCHED | not expired, offer PENDING and unexpired, inside the loan to value cap | supersedes every other offer, releases the winner's hold into a disbursement and a fee, encumbers the receipt, writes the loan and both notes, `LoanOriginated` | `accept-offer` |
| `cancel` | DRAFT or ACTIVE to CANCELLED | caller is the borrower | supersedes every pending offer, whose holds stay held for their owners to pull | `cancel-listing` |
| `expire` | ACTIVE to EXPIRED | past `expiresAt` | supersedes every pending offer | **nothing today** |

`expire` is never called. Nothing sweeps listings, and the only scheduled work in the process is the
outbox drain. A listing past its date therefore sits ACTIVE with the date behind it. Functionally
that is contained: browse filters on the clock and acceptance refuses with `LISTING_EXPIRED`. What it
costs is that EXPIRED is a state the database can hold and the product never writes, and that any
screen reading the status alone believes the listing is still taking offers. The portfolio now reads
the date rather than the status for exactly this reason.

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
| `supersede` | PENDING to SUPERSEDED | another offer was accepted, or the listing was cancelled | none. The hold stays held | `accept-offer`, `cancel-listing` |
| `expire` | PENDING to EXPIRED | past `expiresAt` | none | **nothing today** |

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

`expire` is dead here for the same reason as the listing, and the code says so out loud:
`reclaim-hold` accepts an expired PENDING offer and its comment calls the lazy status harmless. It is
harmless to the api. It was not harmless to the screen, which read PENDING as standing.

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
| `open` | SCHEDULED to BIDDING | operations | sets `opensAt` and `closesAt` | `open-liquidation` |
| `bid` | BIDDING, no status change | inside the window, at or above the reserve, above the standing high bid | holds the bidder's funds. The beaten bid stays held for its owner to pull | `place-bid` |
| `close` | BIDDING to SETTLED | at least one bid | releases the winning hold across the waterfall, burns the receipt, marks the loan LIQUIDATED, `LiquidationSettled` | `close-liquidation` |
| `cancel` | SCHEDULED to CANCELLED | none | none | **nothing today** |

Two problems here, and the drawing is one of them.

`docs/02` draws `cancel` hanging off BIDDING. The code allows it only from SCHEDULED. The code is
right and the drawing is wrong: cancelling an auction that has live bids would have to refund every
hold on it, and nothing does that. Correct the drawing rather than the table.

Cancelling is unreachable either way. There is no endpoint, `docs/10` flow 8 never mentions it, and
nothing calls `Liquidation.cancel()`. CANCELLED is a state the schema can hold and the product
cannot enter.

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

**1. A beaten bidder cannot get their money back from any screen.** `place-bid` holds funds and
leaves a beaten bid held, pull not push, the same as an offer. `POST /liquidations/:id/bids/:id/reclaim`
exists and `reclaimBid` is in the contracts client, but no application calls it, and the portfolio
models listings, offers, loans and note sales, never bids. So the money is held, no row shows it and
the bell cannot count it. This is the exact failure the attention band was built for, in the one
place it does not reach.

**2. `docs/OPEN-QUESTIONS.md` Q-006 records a decision that is not implemented.** It says the winning
bidder receives a newly issued receipt for the same item. `close-liquidation` burns the old receipt
and issues nothing. After a sale the buyer holds no representation of the item at all. Either the
issuance is missing or the recorded answer is stale, and until one of them moves the file is telling
a reader something untrue.

**3. Three transitions are drawn and coded and never fired:** `Listing.expire`, `Offer.expire` and
`Liquidation.cancel`. The first two are contained, because every guard that matters reads the clock
rather than the status, and the screens now do too. The third means a scheduled sale can never be
called off.

**4. Four state changes emit no event:** a cancelled listing, a superseded offer, a scheduled
liquidation and an opened one. Every other transition that matters publishes one. `docs/08` has the
Phase 3 indexer rebuilding state from events, so these are the four it would not see.

**5. The `docs/02` drawings are stale in three places:** the receipt's `claimDefault` target and its
liquidation burn, both already argued out in Q-012 and never redrawn, and the liquidation `cancel`
arrow hanging off the wrong state.

None of these is a live money defect. The ledger balances, every guard holds, and no transition can
be fired from a state that forbids it. What they are is a set of places where the map and the ground
disagree, which is the kind of thing that is cheap now and expensive at the Move rewrite, when the
map is what somebody will build from.
