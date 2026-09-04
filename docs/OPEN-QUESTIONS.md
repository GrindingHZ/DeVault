# Open Questions

Append here rather than guessing. Each entry: the question, why it blocks, the narrow reading
currently implemented, and who can resolve it.

Format:

```
## Q-00N: short title
**Blocks:** slice or flow
**Currently implemented:** the narrowest reading
**Needs:** who decides
**Notes:**
```

---

## Q-001: jurisdiction for the demo
**Blocks:** statutory holding period, rate caps, surplus return, police reporting fields
**Currently implemented:** parameters are configurable with placeholder values; holding period 30 days,
maximum rate 4800 basis points, surplus always returned
**Needs:** founder, then a lawyer in the target jurisdiction
**Notes:** Pawnbroking is licensed per state or province in most countries, with per-facility licences
and prescribed record-keeping. The intake record schema may need mandated fields we have not modelled.

## Q-002: is the lender note a financial product
**Blocks:** whether note transfer ships enabled, and whether retail lenders can participate at all
**Currently implemented:** notes are minted and the P8h secondary market sells them: listing and
purchase are both gated on the `notesTransferable` parameter and the note's own minted field. The
demo parameters turn the switch on so the market has something to show; production defaults stay
off. An earlier revision of this entry claimed a bare transfer endpoint existed; it never did, and
the sale endpoints subsumed it (docs/04-api-contract.md)
**Needs:** securities counsel
**Notes:** A transferable, yield-bearing claim on a loan is close to the definition of a security in
most regimes. This is the single largest legal question in the design.

## Q-003: item categories for the demo
**Blocks:** LTV table, appraisal workflow, authentication steps in the intake wizard
**Currently implemented:** `BULLION` only, LTV cap 6000 basis points
**Needs:** founder
**Notes:** Bullion is assayable, publicly priced, and liquid, which makes appraisal near-objective.
Watches and jewellery introduce authentication risk. Art is a different business.

## Q-004: deposit and withdrawal in Phase 1
**Blocks:** the wallet screen and the demo script
**Currently implemented:** operations-only admin deposit; no payment rail
**Needs:** founder
**Notes:** A real rail (card, bank transfer) adds PCI and reconciliation scope for no demo benefit,
and is thrown away at Phase 3 anyway.

## Q-005: dual appraisal threshold
**Blocks:** the intake wizard branch
**Currently implemented:** a configurable threshold, defaulted high enough that the demo path is
single-appraisal
**Needs:** operations policy

## Q-006: who takes physical delivery after liquidation
**Blocks:** the final step of Flow 8
**Currently implemented:** the winning bidder receives a newly issued receipt for the same item,
and collects it at the counter through flow 6. For most of the build this entry claimed that and
the code did the opposite: `close-liquidation` burned the old receipt and issued none, so a buyer
ended a settled sale holding no representation of the thing they paid for, checked against the
seeded demo where both auction winners held zero receipts (docs/14-state-machines.md)
**Needs:** nothing further
**Notes:** The alternative is that we ship it, which introduces logistics, insurance in transit, and
a delivery-dispute flow.

**Resolved:** implemented as recorded. `close-liquidation` now calls
`CustodyPort.reissueToBuyer`, which burns the seller's receipt and issues the buyer one for the same
item, in the same transaction. Every descriptive field carries over, the intake record hash included,
so the buyer's receipt shows the same photograph and serial numbers the borrower's did. The receipt
lands `IN_VAULT` under the buyer, which means collecting it is flow 6 with no special case. The
database index on `intake_record_hash` became partial on the live statuses to allow it: the
invariant that matters is one live receipt per item, and a burned receipt is history.

## Q-007: minimum offer lifetime
**Blocks:** rule M6
**Currently implemented:** 10 minutes
**Needs:** founder
**Notes:** Too short and a lender can bait a borrower then withdraw mid-acceptance. Too long and
lenders will not commit capital.

## Q-008: error codes missing from the contract table
**Blocks:** validation responses, duplicate registration, generic faults
**Currently implemented:** `VALIDATION_FAILED` (400), `EMAIL_ALREADY_REGISTERED` (409), and
`FAULT` (500) added to `packages/contracts/src/error-codes.ts`, since `docs/04-api-contract.md`
requires a stable code on every error envelope but lists none for these cases
**Needs:** whoever owns the API contract
**Notes:** The docs list also omits codes for rate limiting; add one when a limiter exists.

## Q-009: commit scope for the test support package
**Blocks:** commit messages touching `packages/test-support`
**Currently implemented:** the scope `test-support` is used, since the docs/12 scope list predates
the package and lists no fitting scope; the commit hook accepts any lowercase scope
**Needs:** whoever owns docs/12
**Notes:** Either `test-support` joins the list or those commits fold under an existing scope.

## Q-010: ledger transaction kind for hold releases
**Blocks:** the `SETTLE_LIQUIDATION` entry shape in P6
**Answered in p6b:** `releaseHold` now takes a `ReleaseReason`, so the caller names why the hold is
being released and the adapter writes that as the ledger kind. The alternative, deriving the kind
from the shape of a distribution, would have made the ledger's account of itself depend on how many
recipients a settlement happened to have.
**Previously:** `releaseHold` wrote kind `ORIGINATE_LOAN`, the only release in scope through P5; the
port signature from docs/01 carried no kind parameter
**Needs:** whoever owns docs/01 and docs/03
**Notes:** When liquidation bidding reuses holds, either the port gains a kind, the adapter
derives it from the distribution shape, or bids get their own port method.

## Q-011: whose account does POST /me/deposits credit
**Blocks:** the wallet slice and the admin deposit tool
**Currently implemented:** the operations caller posts `{ email, amount }` and the deposit lands
on the named account, defaulting to the caller's own account when the email is omitted
**Needs:** whoever owns docs/04
**Notes:** docs/04 restricts the endpoint to operations while docs/05 gives the admin app a tool
that funds other members; a literal reading of the `/me` path could only fund the operations
account itself.

## Q-012: receipt state after a default claim
**Blocks:** the custody receipt transition table
**Currently implemented:** `claimDefault` moves the receipt to `IN_VAULT` under the claimant per
docs/10 flow 7, and `burnForLiquidation` is reachable from both `IN_VAULT` and `ENCUMBERED`
**Needs:** whoever owns docs/02
**Notes:** The docs/02 diagram keeps the claimed receipt `ENCUMBERED` with a holder change, while
flow 7 says the claimant holds it `IN_VAULT`; the flow reading lets the claimant redeem through
flow 6 without a special case. P6a settles the argument with evidence: an integration test carries a
lender from default through the claim into a redemption request, which only works because the
receipt lands `IN_VAULT`. The diagram is the side that needs correcting. The diagram also shows liquidation burning only from `IN_VAULT`,
but flow 8 can run before any lender claim.

## Q-013: pause check inside origination before P7
**Blocks:** the accept offer use case
**Currently implemented:** origination does not consult a pause state because none exists before
P7 builds the pause switch and its never-block-exit tests
**Needs:** whoever owns docs/10
**Notes:** Flow 4 step 4 asserts the system is not paused. The narrowest reading defers the
assertion to the P7 slice that introduces the pause state, which must then add it to every
blocked entry point listed in docs/10 in one pass.

## Q-014: badge tone for an active loan past the end of grace
**Blocks:** the loan status badge in the marketplace
**Currently implemented:** any ACTIVE loan past maturity reads warning and is labelled
PAST MATURITY, whether or not grace has ended
**Needs:** whoever owns docs/DESIGN-BRIEF.md
**Notes:** The brief gives warning to a loan that is past maturity and in grace, and danger to a
loan that is DEFAULTED. A loan that has run past the end of grace while no note holder has marked
it defaulted falls between the two cells, and calling it in grace on screen would be false.

## Q-015: should the payoff quote validity be a protocol parameter
**Blocks:** the payoff quote
**Currently implemented:** a five minute window as a constant beside the query
**Needs:** whoever owns docs/03
**Notes:** docs/10 flow 5 requires a validUntil and a stale rejection but names no duration. The
window trades how long a borrower has to act against how far the charged amount can drift from the
figure on screen, which reads like an operations dial rather than a code constant.

## Q-016: the test clock is shared by every Playwright project
**Blocks:** any further spec that needs to move time
**Currently implemented:** clock moving specs run in their own project that depends on the other
three, so they start only once everything else has finished, and they reset the clock afterwards
**Needs:** whoever owns docs/06
**Notes:** docs/06 asks for a POST /test/clock/advance endpoint and separately forbids shared
mutable fixtures between tests. One api process serves every project, so the offset is exactly such
a fixture: advancing it ages out the listings and offers other specs are working with. Scoping the
offset to a request header would make it per client, at the cost of threading an async local
through the clock adapter.

## Q-017: where redemption status belongs in the marketplace
**Blocks:** nothing; the information is on screen either way
**Currently implemented:** redemption status is a column on `/borrow/receipts` beside the receipt
it belongs to, and there is no `/borrow/redemptions` route
**Needs:** whoever owns docs/05
**Notes:** The route table names `/borrow/redemptions` for requests and their status. A request has
no life of its own away from its receipt, and a borrower looking for an item looks for the item, so
the narrowest reading put the status where the receipt already is. A separate route is worth
building if redemptions grow fields of their own, such as an appointment time.

## Q-018: the code for claiming collateral on a loan that never defaulted
**Blocks:** the claim receipt endpoint
**Currently implemented:** LOAN_NOT_DEFAULTED, a new code registered alongside the others, while a
loan that closed before the claim answers LOAN_NOT_ACTIVE as flow 7 names
**Needs:** whoever owns docs/04
**Notes:** The flow 7 failure table covers the loan repaid before the claim but not the loan that is
still healthy and inside its term. Reusing LOAN_NOT_ACTIVE for a live loan would be false, so the
narrowest reading added a code rather than stretching one. The canonical list in docs/04 does not
carry it yet.

## Q-019: the rounding line and the ledger's positive amount rule
**Blocks:** the liquidation settlement
**Currently implemented:** the waterfall always computes all four lines, including a rounding line
that is usually zero, and the close use case drops the zero valued ones before settling
**Needs:** whoever owns docs/03
**Notes:** docs/03 says the remainder line must never be omitted, while the ledger has forbidden a
non positive entry amount since P1 and enforces it in the entity, in a database trigger, and in a
property test. Reading the two together, never omitted means never forgotten in the arithmetic
rather than always written as an entry: a movement of zero is not a movement, and the four line
calculation is what proves the parts still sum to the whole.

## Q-020: may a sale close before its bidding window ends
**Blocks:** nothing today
**Currently implemented:** operations may close as soon as any bid clears the reserve, and the
closing time only governs whether further bids are accepted
**Needs:** whoever owns docs/10
**Notes:** Flow 8 sets a closesAt when the sale opens and gives no rule about closing early. Letting
operations settle the moment a bid lands undercuts the point of advertising a window to bidders,
while forcing them to wait leaves an item unsold when everyone has finished bidding. The narrowest
reading keeps closesAt governing bids only.

## Q-021: who may read the reason trading stopped
**Blocks:** nothing today
**Currently implemented:** any signed in account can read the pause state, including the free text
reason and the account that pulled the switch
**Needs:** whoever owns docs/10
**Notes:** Flow 11 wants members to know trading is paused rather than guessing why an offer was
refused, which argues for showing the reason. The same field is the audit record of why an operator
stopped the market, and an operator writing an internal note into it would broadcast that note to
every member. Splitting a public message from a private reason would settle it.

## Q-022: how a second api process learns a parameter edit landed
**Blocks:** nothing in Phase 1
**Currently implemented:** the registry holds the versions in memory and reloads after its own
write, so a process that did not handle the PUT keeps serving the previous version until it restarts
**Needs:** whoever owns docs/01
**Notes:** Phase 1 runs one process, so the question is theoretical today. A second replica would
need a poll, a notification, or a read through cache. Effective dates already work without a write,
because the version in force is recomputed from the cached rows on every read; the gap is only the
arrival of a brand new version. Phase 3 removes the question entirely: the parameters live in a
shared Config object every reader sees.

## Q-023: whether outbox delivery must become exactly once before Phase 3
**Blocks:** the chain submission adapter
**Currently implemented:** at least once. A crash between a successful publish and the published_at
write leaves the row claimed, and the claim expires after the visibility window, so the event is
delivered again
**Needs:** whoever owns docs/08
**Notes:** A duplicate log line costs nothing, which is why this is not a Phase 1 defect. A duplicate
chain submission is a different matter. The usual answer is an idempotency key carried into the
submission so the chain itself rejects the second copy, which is closer to how the rest of this
system already works than trying to make the queue exactly once.

## Q-024: whether ordinary development should share the demo clock
**Blocks:** nothing today
**Currently implemented:** `pnpm dev` runs the api in demo mode, so it reads the offset the seed
left in `demo_clock`, which the seed now lands on roughly the real today rather than months beyond
it: the story starts its clock four months back and plays forwards
**Needs:** whoever owns docs/11
**Notes:** The demo needs this, because the seed and the serving process are two processes and the
loan book only makes sense against the clock it was written under. Ordinary development inherits it
as a side effect: after a seed, a developer's api is dated two months out. That is harmless while
every date on every screen comes from the same clock, and it is what the demo is going to do
anyway, so running development in the same mode is at least honest. The alternative is a third
mode, which is a mode nobody would remember to use. Resetting is one call to the clock route.

## Q-025: where derived image sizes should come from
**Blocks:** nothing today
**Currently implemented:** the original bytes are served as uploaded, under a content hash key, with
an immutable cache header and a size cap of eight megabytes at upload
**Needs:** whoever owns docs/01
**Notes:** A browse row shows a photograph at 56 pixels and is handed whatever the vault staff
uploaded, which on a real phone is several megabytes. Deriving sizes at upload needs a native image
dependency; deriving them on read needs the same dependency plus a cache. Neither is worth carrying
while the bytes live on one machine's disk. The moment they move to a bucket, the bucket's own image
service or a CDN in front of it does this properly, and the key is already a content hash so every
derived size is safely cacheable forever. Until then the cap is what keeps it honest.

## Q-026: whether a borrower may add their own photographs
**Blocks:** nothing today
**Currently implemented:** only vault staff can attach a photograph, and only to an intake they are
recording, before it is sealed
**Needs:** whoever owns docs/00
**Notes:** The photograph is evidence that a named member of staff had the item in their hands on a
given day, which is exactly what makes it worth showing to a lender. A borrower supplied image would
be a different kind of thing wearing the same clothes. If borrowers ever do upload, the two need to
be visibly distinct on screen, not merged into one gallery.

## Q-027: whether the operations consoles should read like the marketplace
**Blocks:** nothing today
**Currently implemented:** revisited in P0.6 and answered narrowly. The vault console and the admin
still lead with identifiers and monospace and still carry no explain layer. What they did adopt is
the shared component layer and the stronger control boundary, because those are not a voice.
**Needs:** whoever owns docs/05
**Notes:** The original entry recorded the split as a decision rather than as unfinished work, and
that half still holds: staff quote receipt ids to each other and read them off labels, so a table
that leads with the id is the right tool rather than a shortcoming. What the original entry did not
separate is voice from machinery. Applying a lender's explain layer to an operations console would
be copying a pattern; giving every application the same button, the same field and a control
boundary that meets WCAG 1.4.11 is fixing a defect that happened to be visible in three places at
once. The marketplace going dark did not spread to them, which is the part the P0.6 amendment in
docs/13-design-system.md holds to one scope.

## Q-028: whether the borrow and lend split should survive as navigation
**Blocks:** nothing today
**Currently implemented:** no. The split is a filter on `/portfolio`, not a pair of sections. The
navigation rail carries four destinations rather than seven, and the four role split routes redirect.
**Needs:** whoever owns docs/05
**Notes:** The split came from the domain, where borrowing and lending really are two roles with two
sets of rules. It does not come from the person: in this product the same account does both, often
against the same item. Four screens meant one loan was rendered twice under two different names, and
a reader had to visit both to know where they stood. Keeping the distinction as a filter keeps the
part that is true (a position is read from one side, and which side changes what every column means)
and drops the part that was only an artefact of how the endpoints are grouped. If a future account
type can only ever lend, the filter becomes a default rather than a new screen.

## Q-029: what a repaid loan actually cost
**Blocks:** the closed rows of the portfolio, which show a dash where an interest figure belongs
**Currently implemented:** nothing. `accruedInterest` is recomputed against the server clock on
every read, clamped at maturity but not at settlement, so a loan repaid on day three reports what
thirty days would have cost. The portfolio shows no interest figure once a loan leaves ACTIVE
rather than showing that one.
**Needs:** whoever owns docs/03
**Notes:** The loan records `defaultedAt` but not the moment of repayment, so the true figure cannot
be derived from the row. The fix is a `repaidAt` column plus clamping accrual to it, which is a
migration and a domain change rather than a display one. Worth doing: a lender's realised return
across settled loans is the one number this product cannot currently answer, and it is the number
anybody comparing us to a savings account would ask for first. Until then a dash is the honest
answer, because the alternative is a plausible number that is wrong.

## Q-030: whether a listed item can be asked back without cancelling the listing
**Blocks:** nothing today. The marketplace no longer offers it.
**Currently implemented:** nothing on the server. `RequestRedemptionUseCase` checks that the receipt
exists and that the caller holds it, then burns the receipt. It does not ask whether a live listing
stands against that receipt, so a borrower could redeem an item that lenders are still bidding on and
leave the listing pointing at a spent receipt.
**Needs:** whoever owns docs/02
**Notes:** Found while fixing the borrower inventory, which was offering "List" and "Ask for it back"
on an item already listed. The listing button was refused by `ReceiptAlreadyListed`, so that half was
merely rude; the redemption half would have gone through. The screen now hides both once a live
listing stands, which closes the path a person can actually take, but a rule enforced only by a
button is not enforced. The fix is a check in the use case, either refusing the redemption or
cancelling the listing in the same transaction. Cancelling is the friendlier reading and is one
transaction either way, since holds are released on cancellation already.

## Q-030: may a borrower buy the note on their own loan
**Blocks:** nothing today; the purchase policy refuses it with CANNOT_BUY_OWN_POSITION
**Currently implemented:** no. Neither the seller nor the borrower may buy a listed position
**Needs:** founder
**Notes:** A borrower buying their own debt at a discount is a real instrument, a buyback, and it
would let a borrower settle for less than the amount due whenever a lender wants out badly enough.
That changes the economics every lender priced their offer against, so it is a product decision
rather than an edge case. Mechanically it would work today: repayment pays the holder, and a
borrower holding their own note would pay themselves. The narrowest reading keeps the two sides of
a loan distinct until somebody decides otherwise.

## Q-031: a parameter version dated ahead of its write never reaches the chain config
**Blocks:** nothing today; the demo writes versions effective at once
**Currently implemented:** `SuiProtocolParametersAdapter.writeVersion` mirrors a version onto
the chain `Config` only when its effective instant is at or before the write. A future dated
version stays in the database and the chain config keeps the previous values until another
version is written after the date passes.
**Needs:** whoever owns docs/08
**Notes:** The mirror is informational: no Move function reads the fee or the loan to value
caps, because the domain computes every split and passes amounts. Closing the gap means a
scheduled job that applies the version in force at its effective instant, or a `Config` that
stores the pending version beside the current one with its date and switches on read.

## Q-032: the market's state machines stay in the application layer on Phase 3
**Blocks:** nothing today
**Currently implemented:** listings, offers, loans, notes, sales and liquidations run in the api
and are attested on chain event by event; money and title are enforced by the escrow and custody
modules, which is what the two ports reach
**Needs:** founder
**Notes:** Moving the state machines into Move objects needs a port per use case, which is a
rewrite of the application layer rather than an adapter swap; the spec records the reasoning.

## Q-033: members sign only their deposits
**Blocks:** nothing today
**Currently implemented:** the operator key signs every transaction a use case produces, under
the api's own authorisation; a member with a linked wallet signs the deposit that moves USDC
into their wallet object, and a withdrawal lands on the address they linked
**Needs:** founder, then whoever owns docs/08
**Notes:** Member signed offers and repayments need per use case entry points authorised by the
acting address and a gas arrangement, which the escrow module does not yet offer.

## Q-034: one custodian capability for every vault
**Blocks:** nothing today
**Currently implemented:** `init` mints one `CustodianCap` to the publisher, and every receipt
carries its vault id as a field; the custodian of record is the operator
**Needs:** operations policy
**Notes:** A capability per vault is a mint and a transfer, and a `vault` field on the
capability the custody functions assert against.

## Q-035: read-your-writes across the indexer gap
**Blocks:** every self-custody write screen (p12g)
**Currently implemented:** nothing yet. In the self-custody design the member's wallet submits the
transaction and the indexer projects the result, so a member who just signed sees stale read models
until the next poll.
**Needs:** whoever owns docs/05 and docs/08
**Notes:** The frontend holds the transaction digest and the created object ids the wallet returns,
and can show an optimistic pending state keyed on them until the indexer confirms. The alternative
is a read-through that fetches the object directly on the affected screen. Touches every write.

## Q-036: member-paid gas versus sponsored transactions
**Blocks:** nothing today; the design assumes the acting member pays their own gas
**Currently implemented:** the member who signs a market action pays its gas
**Needs:** founder, then whoever owns docs/08
**Notes:** Sponsored transactions let the platform pay gas for a member's action to smooth the
experience, at the cost of a sponsoring service and its own signing key. Not built now.

## Q-037: the transferable LenderNote as a bearer instrument
**Blocks:** whether the secondary market ships enabled (sharpens Q-002)
**Currently implemented:** notes are `key, store` and transferable, and the market module swaps
them atomically; the demo parameter keeps `notes_transferable` on
**Needs:** securities counsel
**Notes:** A bearer, yield-bearing claim on a loan that the escrow pays to whoever presents it is
closer still to a security than the Postgres note record was. Q-002 is the same question; this
phase raises the stakes because the instrument is now genuinely bearer.

## Q-038: KYC and who may hold a transferable BorrowerNote
**Blocks:** nothing today; the BorrowerNote is transferable by the same switch as the LenderNote
**Currently implemented:** both notes transfer; a BorrowerNote sale is the right to redeem a
pledged item by paying off its loan
**Needs:** founder, then compliance
**Notes:** For a KYC'd pawnbroker the redemption right arguably belongs to the person who pawned
the item. Disabling BorrowerNote transfer while keeping LenderNote transfer is a policy switch, not
new mechanism.

## Q-039: a lost note key is a lost claim
**Blocks:** nothing today; it is the accepted cost of self-custody
**Currently implemented:** no recovery. The platform holds no capability that can reissue or
reassign a note, which is the property that makes it self-custodial
**Needs:** founder
**Notes:** A social-recovery or long-timeout escape hatch would reintroduce a platform power over a
member's claim and weaken the guarantee. The narrowest reading accepts the loss and states it
plainly to members.

## Q-040: do platform accounts keep an operator wallet
**Blocks:** the fee split in `pledge::accept` (p12d)
**Currently implemented:** the design sends the origination fee to the platform's address; whether
that is a shared operator `Wallet` or a plain address that receives a USDC coin is open
**Needs:** whoever owns docs/03
**Notes:** Members no longer have a shared `Wallet`, but platform fee revenue still has to land
somewhere countable. A plain address receiving coins is simplest; a retained operator wallet keeps
the reconciliation basis the custodial build used.

## Q-041: atomic swap object versus a Kiosk for the secondary market
**Blocks:** the market module (p12f)
**Currently implemented:** the design uses a bespoke `PositionListing` shared object and a
`buy_position` that swaps the note for USDC atomically
**Needs:** whoever owns docs/08
**Notes:** Sui's Kiosk standard offers a transfer policy and a shared marketplace primitive that
could carry the note sale instead, with royalty and rule support the bespoke object lacks. The
bespoke object is smaller and matches the primary market's shape; the Kiosk is more standard and
more work.

## Q-042: does OfferMade carry expires_at
**Blocks:** the indexer projection for Committed and Reclaimable (wallet Phase 2)
**Currently implemented:** `escrow::OfferMade` carries hold_id, hold_key, owner, amount, pledge_id,
but not expires_at, which the wallet needs to tell a standing offer from an expired one
**Needs:** whoever owns docs/08
**Notes:** Add expires_at to the event, or have the indexer read the FundsHold object once on
OfferMade. The event field is the narrower change and needs no extra read.

## Q-043: reading a pledge per owned note is an N+1
**Blocks:** the chain-direct wallet reads (wallet Phase 1)
**Currently implemented:** the design resolves each owned note's terms and status by reading its
Pledge object; a member with many notes issues many reads
**Needs:** whoever owns docs/05
**Notes:** multiGetObjects batches the calls into one request. If a member holds enough notes that
this is still slow, the indexer read model is the fallback. Measure before optimising.

## Q-044: where a member's on-chain history comes from
**Blocks:** the wallet History section (wallet Phase 2)
**Currently implemented:** the ledger history table is removed; the replacement is unspecified
**Needs:** whoever owns docs/05
**Notes:** The indexer's projected events for the member's address, or a link out to the explorer
for the first cut. Decide in Phase 2.

## Q-045: is the testnet USDC mint sponsored
**Blocks:** the wallet Get USDC action (wallet Phase 1)
**Currently implemented:** Get USDC on testnet mints the stand-in USDC through the operator; whether
the member signs a sponsored mint or the operator mints to them directly is open
**Needs:** whoever owns docs/08
**Notes:** Every other member action is sponsored, so the member needs no SUI. The mint should keep
that property, either as a sponsored member transaction or an operator-run mint to the member's
address.
