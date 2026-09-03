/// An offer is the lender's own USDC, locked in a shared hold against one
/// pledge until it wins, loses, or expires. The lender makes it with their
/// own signature, and it can only ever go two places: into the loan the
/// borrower accepts, or back to the lender. No capability appears here, and a
/// pause blocks a new offer but never a refund, so the exit the lender
/// controls can never be locked
/// (docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md).
///
/// The hold is made and judged through `pledge`, which reads the listing:
/// this module never sees more than a pledge id and the facts that module
/// read, which is what keeps it free of a dependency the other way.
module depawn::escrow;

use depawn::config::Config;
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const EEmptyKey: u64 = 0;
const EZeroAmount: u64 = 1;
const EOfferTooShort: u64 = 2;
const ENotExpired: u64 = 3;
const EStillOpen: u64 = 4;
const EWon: u64 = 5;
const EZeroRate: u64 = 6;

/// `hold_key` is the api's funds hold id, `pledge_id` the pledge this offer
/// funds, `apr_bps` the annual rate the lender is offering to lend it at (they
/// compete by undercutting the borrower's asked maximum), `expires_at` the
/// instant past which it can only be refunded.
public struct FundsHold<phantom T> has key {
    id: UID,
    hold_key: vector<u8>,
    owner: address,
    funds: Balance<T>,
    pledge_id: ID,
    apr_bps: u16,
    expires_at: u64,
}

public struct OfferMade has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
    apr_bps: u16,
    pledge_id: ID,
}

public struct OfferAccepted has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
    pledge_id: ID,
}

public struct OfferRefunded has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
}

/// The one entrance a pause closes. The lender's coin becomes the hold's
/// balance; the expiry must clear the minimum offer lifetime so a lender
/// cannot bait a borrower and yank the money before the minimum. Reached
/// only through `pledge::offer`, which has read the listing the id names
/// and refused one that is not open: a hold can never be made against a
/// pledge that cannot accept it.
public(package) fun make_offer<T>(
    config: &Config,
    pledge_id: ID,
    hold_key: vector<u8>,
    payment: Coin<T>,
    apr_bps: u16,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    config.assert_not_paused();
    assert!(!hold_key.is_empty(), EEmptyKey);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    assert!(apr_bps > 0, EZeroRate);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    assert!(expires_at >= clock.timestamp_ms() + minimum, EOfferTooShort);
    let hold = FundsHold<T> {
        id: object::new(ctx),
        hold_key,
        owner: ctx.sender(),
        funds: payment.into_balance(),
        pledge_id,
        apr_bps,
        expires_at,
    };
    event::emit(OfferMade {
        hold_id: object::id(&hold),
        hold_key: hold.hold_key,
        owner: hold.owner,
        amount,
        apr_bps,
        pledge_id,
    });
    transfer::share_object(hold);
}

/// Pull, not push: anyone may trigger it once the offer has expired, and the
/// money can only ever go home to its owner.
public fun refund_expired<T>(hold: FundsHold<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(clock.timestamp_ms() >= hold.expires_at, ENotExpired);
    refund(hold, ctx);
}

/// A loser reclaims the moment the pledge stops taking offers. Reached only
/// through `pledge::refund_losing`, which reads the pledge's status and
/// accepted key off the object and passes them, so the facts are the
/// chain's and not the caller's.
public(package) fun refund_losing<T>(
    hold: FundsHold<T>,
    pledge_matched: bool,
    accepted_hold_key: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(pledge_matched, EStillOpen);
    assert!(accepted_hold_key != hold.hold_key, EWon);
    refund(hold, ctx);
}

/// Consumes the winning hold into its principal, for the pledge module to
/// disburse. Announces the acceptance so the indexer can mark the offer won.
public(package) fun into_principal<T>(hold: FundsHold<T>): (Balance<T>, vector<u8>, address, u16) {
    let FundsHold { id, hold_key, owner, funds, pledge_id, apr_bps, expires_at: _ } = hold;
    event::emit(OfferAccepted {
        hold_id: id.to_inner(),
        hold_key,
        owner,
        amount: funds.value(),
        pledge_id,
    });
    id.delete();
    (funds, hold_key, owner, apr_bps)
}

public fun hold_key<T>(hold: &FundsHold<T>): &vector<u8> { &hold.hold_key }

public fun hold_owner<T>(hold: &FundsHold<T>): address { hold.owner }

public fun hold_amount<T>(hold: &FundsHold<T>): u64 { hold.funds.value() }

public fun hold_pledge_id<T>(hold: &FundsHold<T>): ID { hold.pledge_id }

public fun hold_expires_at<T>(hold: &FundsHold<T>): u64 { hold.expires_at }

fun refund<T>(hold: FundsHold<T>, ctx: &mut TxContext) {
    let FundsHold { id, hold_key, owner, funds, pledge_id: _, apr_bps: _, expires_at: _ } = hold;
    let amount = funds.value();
    event::emit(OfferRefunded {
        hold_id: id.to_inner(),
        hold_key,
        owner,
        amount,
    });
    id.delete();
    transfer::public_transfer(coin::from_balance(funds, ctx), owner);
}
