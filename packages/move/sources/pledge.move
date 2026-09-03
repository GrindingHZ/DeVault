/// The shared escrow that spans a listing and the loan it becomes. It wraps
/// the borrower's receipt from the moment they list to the moment the loan
/// settles, so the receipt never has to move between objects and a losing
/// offer can read the pledge's status to prove it lost. Every transition is
/// signed by the member who acts and carries no capability: the object holds
/// only shared state and the one signer's own inputs
/// (docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md).
module depawn::pledge;

use depawn::custody::VaultReceipt;
use sui::balance::{Self, Balance};
use sui::event;

const OPEN: u8 = 0;
const ACTIVE: u8 = 1;

const ENotBorrower: u64 = 0;
const ENotOpen: u64 = 1;

/// `receipt` is an `Option` so a later transition can take the item out
/// without leaving a sentinel behind. `parked` is empty until a repayment
/// leaves the payoff here for the lender to pull.
public struct Pledge<phantom T> has key {
    id: UID,
    borrower: address,
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

public fun open<T>(receipt: VaultReceipt, requested_apr_bps: u16, ctx: &mut TxContext) {
    let pledge = Pledge<T> {
        id: object::new(ctx),
        borrower: ctx.sender(),
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

public fun cancel<T>(pledge: Pledge<T>, ctx: &mut TxContext) {
    assert!(pledge.borrower == ctx.sender(), ENotBorrower);
    assert!(pledge.status == OPEN, ENotOpen);
    let Pledge { id, borrower, mut receipt, parked, .. } = pledge;
    let item = receipt.extract();
    receipt.destroy_none();
    parked.destroy_zero();
    event::emit(ListingCancelled {
        pledge_id: id.to_inner(),
        receipt_key: *item.receipt_key(),
    });
    id.delete();
    transfer::public_transfer(item, borrower);
}

public fun borrower<T>(pledge: &Pledge<T>): address { pledge.borrower }

public fun status<T>(pledge: &Pledge<T>): u8 { pledge.status }

public fun requested_apr_bps<T>(pledge: &Pledge<T>): u16 { pledge.requested_apr_bps }

public fun is_open<T>(pledge: &Pledge<T>): bool { pledge.status == OPEN }

public fun is_active<T>(pledge: &Pledge<T>): bool { pledge.status == ACTIVE }
