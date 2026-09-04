/// The shared escrow that spans a listing and the loan it becomes. It wraps
/// the borrower's receipt from the moment they list to the moment the loan
/// settles, so the receipt never has to move between objects and a losing
/// offer can read the pledge's status to prove it lost. Every transition is
/// signed by the member who acts and carries no capability: the object holds
/// only shared state and the one signer's own inputs.
///
/// A pledge is never deleted. A cancelled listing and a collected loan stay
/// behind as the record of what happened, because an offer made against
/// either before it closed can only prove it lost by reading the status
/// here; without the record its money would wait out its own expiry.
module depawn::pledge;

use depawn::config::Config;
use depawn::custody::VaultReceipt;
use depawn::escrow::{Self, FundsHold};
use depawn::interest;
use depawn::notes::{Self, LenderNote, BorrowerNote};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const OPEN: u8 = 0;
const ACTIVE: u8 = 1;
const REPAID: u8 = 2;
const DEFAULTED: u8 = 3;
const CANCELLED: u8 = 4;
const CLOSED: u8 = 5;

const BASIS_POINTS_IN_WHOLE: u128 = 10_000;

const ENotBorrower: u64 = 0;
const ENotOpen: u64 = 1;
const EWrongPledge: u64 = 2;
const ERateTooHigh: u64 = 3;
const EPastGrace: u64 = 4;
const EBeforeGrace: u64 = 5;
const ENotRepaid: u64 = 6;
const EInsufficientPayment: u64 = 7;
const EWrongNote: u64 = 8;
const EZeroPrincipal: u64 = 9;
const EPrincipalTooHigh: u64 = 10;
const EBadCategory: u64 = 11;
const ESelfOffer: u64 = 12;
const EWrongAmount: u64 = 13;
const EOfferExpired: u64 = 14;
const ENotActive: u64 = 15;

/// `receipt` is an `Option` so a later transition can take the item out
/// without leaving a sentinel behind. `parked` is empty until a repayment
/// leaves the payoff here for the lender to pull.
public struct Pledge<phantom T> has key {
    id: UID,
    borrower: address,
    requested_principal: u64,
    requested_apr_bps: u16,
    receipt: Option<VaultReceipt>,
    status: u8,
    accepted_hold_key: vector<u8>,
    lender_note_id: Option<ID>,
    borrower_note_id: Option<ID>,
    principal: u64,
    apr_bps: u16,
    started_at_ms: u64,
    matures_at_ms: u64,
    grace_period_ms: u64,
    parked: Balance<T>,
}

public struct ListingOpened has copy, drop {
    pledge_id: ID,
    borrower: address,
    receipt_key: vector<u8>,
}

public struct ListingCancelled has copy, drop {
    pledge_id: ID,
    receipt_key: vector<u8>,
}

public struct LoanOriginated has copy, drop {
    pledge_id: ID,
    borrower: address,
    lender: address,
    principal: u64,
    matures_at_ms: u64,
}

public struct LoanRepaid has copy, drop {
    pledge_id: ID,
    amount: u64,
}

public struct LoanSettled has copy, drop {
    pledge_id: ID,
    amount: u64,
}

public struct CollateralClaimed has copy, drop {
    pledge_id: ID,
    claimant: address,
}

/// The borrower names the principal they want and the highest rate they will
/// pay for it; lenders then compete by offering a lower rate. The principal is
/// held to the item's ceiling here (its appraised value scaled by the category
/// loan-to-value), and the rate to the protocol maximum, so an offer can never
/// be accepted above either.
public fun open<T>(
    config: &Config,
    receipt: VaultReceipt,
    requested_principal: u64,
    requested_apr_bps: u16,
    ctx: &mut TxContext,
) {
    let params = config.parameters();
    assert!(requested_apr_bps <= params.max_annual_percentage_rate_bps(), ERateTooHigh);
    assert!(requested_principal > 0, EZeroPrincipal);
    let caps = params.max_loan_to_value_bps();
    let category = receipt.item_category() as u64;
    assert!(category < caps.length(), EBadCategory);
    let cap_bps = *caps.borrow(category) as u128;
    let ceiling = (receipt.appraised_value() as u128 * cap_bps / BASIS_POINTS_IN_WHOLE) as u64;
    assert!(requested_principal <= ceiling, EPrincipalTooHigh);
    let pledge = Pledge<T> {
        id: object::new(ctx),
        borrower: ctx.sender(),
        requested_principal,
        requested_apr_bps,
        receipt: option::some(receipt),
        status: OPEN,
        accepted_hold_key: vector[],
        lender_note_id: option::none(),
        borrower_note_id: option::none(),
        principal: 0,
        apr_bps: 0,
        started_at_ms: 0,
        matures_at_ms: 0,
        grace_period_ms: 0,
        parked: balance::zero(),
    };
    event::emit(ListingOpened {
        pledge_id: object::id(&pledge),
        borrower: pledge.borrower,
        receipt_key: *pledge.receipt.borrow().receipt_key(),
    });
    transfer::share_object(pledge);
}

/// Takes the listing down. The receipt goes back to the borrower and the
/// pledge stays behind as CANCELLED, so an offer made against it before it
/// came down proves it lost against this status and is refunded at once.
public fun cancel<T>(pledge: &mut Pledge<T>, ctx: &mut TxContext) {
    assert!(pledge.borrower == ctx.sender(), ENotBorrower);
    assert!(pledge.status == OPEN, ENotOpen);
    let item = pledge.receipt.extract();
    pledge.status = CANCELLED;
    event::emit(ListingCancelled {
        pledge_id: object::id(pledge),
        receipt_key: *item.receipt_key(),
    });
    transfer::public_transfer(item, pledge.borrower);
}

/// A lender's offer, made against the listing itself rather than its id, so
/// the chain refuses one on a listing that is no longer open, one from the
/// borrower, one for any amount but the principal asked, and one above the
/// asked rate. Lenders compete on the rate alone: the amount is the
/// borrower's, which is why it is checked rather than chosen. The hold this
/// shares can only be consumed by `accept` on this pledge or refunded to the
/// lender.
public fun offer<T>(
    config: &Config,
    pledge: &Pledge<T>,
    hold_key: vector<u8>,
    payment: Coin<T>,
    apr_bps: u16,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pledge.status == OPEN, ENotOpen);
    assert!(pledge.borrower != ctx.sender(), ESelfOffer);
    assert!(payment.value() == pledge.requested_principal, EWrongAmount);
    assert!(apr_bps <= pledge.requested_apr_bps, ERateTooHigh);
    escrow::make_offer(
        config, object::id(pledge), hold_key, payment, apr_bps, expires_at, clock, ctx,
    );
}

/// A losing offer's money goes home the moment its pledge stops taking
/// offers, whatever stopped it: another hold accepted, or the listing taken
/// down. The proof is the pledge's own status and accepted key, read here,
/// so nobody's word is taken for whether the offer lost. Anyone may trigger
/// it; the money can only reach the hold's owner.
public fun refund_losing<T>(pledge: &Pledge<T>, hold: FundsHold<T>, ctx: &mut TxContext) {
    assert!(escrow::hold_pledge_id(&hold) == object::id(pledge), EWrongPledge);
    escrow::refund_losing(hold, pledge.status != OPEN, pledge.accepted_hold_key, ctx);
}

/// The whole of origination, in one transaction the borrower signs once. The
/// chosen offer is shared, so no second lender signature is needed: the
/// lender committed when they made the offer, and the module guarantees the
/// funds can only reach the borrower here or return to the lender on a
/// refund. An offer past its own expiry is the lender's to reclaim, not the
/// borrower's to take. The principal was held to the item's ceiling when the
/// listing opened, so the appraisal is not read a second time here.
public fun accept<T>(
    pledge: &mut Pledge<T>,
    hold: FundsHold<T>,
    config: &Config,
    term_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pledge.status == OPEN, ENotOpen);
    assert!(pledge.borrower == ctx.sender(), ENotBorrower);
    assert!(escrow::hold_pledge_id(&hold) == object::id(pledge), EWrongPledge);
    let now = clock.timestamp_ms();
    assert!(now < escrow::hold_expires_at(&hold), EOfferExpired);
    let params = config.parameters();
    assert!(pledge.requested_apr_bps <= params.max_annual_percentage_rate_bps(), ERateTooHigh);

    let (funds, hold_key, lender, offered_apr_bps) = escrow::into_principal(hold);
    /* The offer competes by undercutting: it may lend at the borrower's asked
       rate or below it, never above. */
    assert!(offered_apr_bps <= pledge.requested_apr_bps, ERateTooHigh);
    let principal = funds.value();
    let matures_at = now + term_ms;

    let mut proceeds = coin::from_balance(funds, ctx);
    let fee = mul_bps(principal, params.origination_fee_bps());
    if (fee > 0) {
        transfer::public_transfer(proceeds.split(fee, ctx), config.fee_recipient());
    };
    transfer::public_transfer(proceeds, pledge.borrower);

    let lender_note = notes::mint_lender_note(
        object::id(pledge), principal, offered_apr_bps, now, matures_at, lender, ctx,
    );
    let borrower_note = notes::mint_borrower_note(object::id(pledge), principal, pledge.borrower, ctx);

    pledge.lender_note_id = option::some(lender_note.lender_note_id());
    pledge.borrower_note_id = option::some(borrower_note.borrower_note_id());
    pledge.status = ACTIVE;
    pledge.accepted_hold_key = hold_key;
    pledge.principal = principal;
    pledge.apr_bps = offered_apr_bps;
    pledge.started_at_ms = now;
    pledge.matures_at_ms = matures_at;
    pledge.grace_period_ms = params.grace_period_ms();

    event::emit(LoanOriginated {
        pledge_id: object::id(pledge),
        borrower: pledge.borrower,
        lender,
        principal,
        matures_at_ms: matures_at,
    });
    transfer::public_transfer(lender_note, lender);
    transfer::public_transfer(borrower_note, pledge.borrower);
}

/// Signed by whoever holds the borrower note, before the grace cliff. The
/// payoff parks in the pledge for the lender to pull, the receipt returns to
/// the payer, and the note burns. Overpayment is refunded rather than parked.
public fun repay<T>(
    pledge: &mut Pledge<T>,
    note: BorrowerNote,
    payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pledge.status == ACTIVE, ENotActive);
    assert!(note.borrower_note_pledge() == object::id(pledge), EWrongNote);
    let now = clock.timestamp_ms();
    assert!(now < pledge.matures_at_ms + pledge.grace_period_ms, EPastGrace);
    let due = interest::amount_due(
        pledge.principal, pledge.apr_bps as u64, pledge.started_at_ms, pledge.matures_at_ms, now,
    );

    let mut proceeds = payment;
    assert!(proceeds.value() >= due, EInsufficientPayment);
    pledge.parked.join(proceeds.split(due, ctx).into_balance());
    if (proceeds.value() > 0) {
        transfer::public_transfer(proceeds, ctx.sender());
    } else {
        proceeds.destroy_zero();
    };

    note.burn_borrower_note();
    pledge.status = REPAID;
    let item = pledge.receipt.extract();
    event::emit(LoanRepaid { pledge_id: object::id(pledge), amount: due });
    transfer::public_transfer(item, ctx.sender());
}

/// Signed by whoever holds the lender note, after repayment. Pulls the parked
/// payoff and closes the pledge, which stays as the record of the loan. The
/// payee is the note holder, so a note sold on the secondary market pays its
/// buyer, not the original lender.
public fun collect<T>(pledge: &mut Pledge<T>, note: LenderNote, ctx: &mut TxContext) {
    assert!(pledge.status == REPAID, ENotRepaid);
    assert!(note.lender_note_pledge() == object::id(pledge), EWrongNote);
    note.burn_lender_note();
    let payoff = pledge.parked.withdraw_all();
    pledge.status = CLOSED;
    event::emit(LoanSettled { pledge_id: object::id(pledge), amount: payoff.value() });
    transfer::public_transfer(coin::from_balance(payoff, ctx), ctx.sender());
}

/// Signed by whoever holds the lender note, after the grace cliff. The
/// borrower can no longer repay, so the collateral goes to the note holder
/// with no permission from the borrower. The defaulted pledge stays as the
/// record of what happened.
public fun claim_default<T>(
    pledge: &mut Pledge<T>,
    note: LenderNote,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pledge.status == ACTIVE, ENotActive);
    assert!(note.lender_note_pledge() == object::id(pledge), EWrongNote);
    assert!(clock.timestamp_ms() >= pledge.matures_at_ms + pledge.grace_period_ms, EBeforeGrace);
    note.burn_lender_note();
    pledge.status = DEFAULTED;
    let item = pledge.receipt.extract();
    event::emit(CollateralClaimed { pledge_id: object::id(pledge), claimant: ctx.sender() });
    transfer::public_transfer(item, ctx.sender());
}

public fun borrower<T>(pledge: &Pledge<T>): address { pledge.borrower }

public fun is_repaid<T>(pledge: &Pledge<T>): bool { pledge.status == REPAID }

public fun is_defaulted<T>(pledge: &Pledge<T>): bool { pledge.status == DEFAULTED }

public fun principal<T>(pledge: &Pledge<T>): u64 { pledge.principal }

public fun accepted_hold_key<T>(pledge: &Pledge<T>): &vector<u8> { &pledge.accepted_hold_key }

fun mul_bps(amount: u64, bps: u16): u64 {
    (((amount as u128) * (bps as u128)) / BASIS_POINTS_IN_WHOLE) as u64
}

public fun status<T>(pledge: &Pledge<T>): u8 { pledge.status }

public fun requested_apr_bps<T>(pledge: &Pledge<T>): u16 { pledge.requested_apr_bps }

public fun is_open<T>(pledge: &Pledge<T>): bool { pledge.status == OPEN }

public fun is_active<T>(pledge: &Pledge<T>): bool { pledge.status == ACTIVE }

public fun is_cancelled<T>(pledge: &Pledge<T>): bool { pledge.status == CANCELLED }

public fun is_closed<T>(pledge: &Pledge<T>): bool { pledge.status == CLOSED }
