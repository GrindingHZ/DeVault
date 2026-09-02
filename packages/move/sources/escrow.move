/// The settlement port as objects. A `Wallet` is an account's available
/// balance, a `FundsHold` is money committed to an offer or a bid, and a
/// `Payout` is a hold being distributed: it has no abilities, so a transaction
/// that opens one and does not empty and finish it does not compile. That is
/// the ledger's balance invariant with the compiler as the trigger
/// (docs/superpowers/specs/2026-08-25-web3-migration-design.md).
module depawn::escrow;

use depawn::config::{Config, OperatorCap};
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;

const EInsufficientFunds: u64 = 0;
const EWrongOwner: u64 = 1;
const EPayoutNotEmpty: u64 = 2;
const EZeroAmount: u64 = 3;
const EEmptyKey: u64 = 4;

/// The available balance of one account in one coin. Shared, so the operator
/// can move it under the api's authorisation; `withdraw` can only ever send
/// its funds to `owner`, which is the exit right the object exists to keep.
public struct Wallet<phantom T> has key {
    id: UID,
    owner: address,
    funds: Balance<T>,
}

/// Money committed to an offer or a bid, out of the wallet until it wins,
/// loses, or is pulled back. `hold_key` is the api's funds hold id.
public struct FundsHold<phantom T> has key {
    id: UID,
    hold_key: vector<u8>,
    owner: address,
    funds: Balance<T>,
    reference: vector<u8>,
}

/// A hold being distributed. No abilities: it must be paid out and finished
/// in the transaction that began it.
public struct Payout<phantom T> {
    hold_key: vector<u8>,
    funds: Balance<T>,
    reason: u8,
}

public struct WalletOpened has copy, drop { wallet_id: ID, owner: address }

public struct FundsDeposited has copy, drop {
    wallet_id: ID,
    owner: address,
    amount: u64,
    reference: vector<u8>,
}

public struct FundsWithdrawn has copy, drop {
    wallet_id: ID,
    owner: address,
    amount: u64,
    reference: vector<u8>,
}

public struct FundsHeld has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
    reference: vector<u8>,
}

public struct HoldRefunded has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
}

public struct HoldReleased has copy, drop {
    hold_id: ID,
    hold_key: vector<u8>,
    owner: address,
    amount: u64,
    reason: u8,
}

public struct Paid has copy, drop {
    hold_key: vector<u8>,
    recipient: address,
    amount: u64,
    reason: u8,
}

public struct FundsTransferred has copy, drop {
    from: address,
    to: address,
    amount: u64,
    reference: vector<u8>,
    reason: u8,
}

public fun open_wallet<T>(_: &OperatorCap, owner: address, ctx: &mut TxContext) {
    share_wallet(Wallet<T> { id: object::new(ctx), owner, funds: balance::zero() });
}

/// Open to anyone: paying money into somebody's wallet harms nobody, and it
/// is how a member's own wallet puts USDC into the book.
public fun deposit<T>(wallet: &mut Wallet<T>, payment: Coin<T>, reference: vector<u8>) {
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    wallet.funds.join(payment.into_balance());
    event::emit(FundsDeposited { wallet_id: object::id(wallet), owner: wallet.owner, amount, reference });
}

public fun deposit_new<T>(
    _: &OperatorCap,
    owner: address,
    payment: Coin<T>,
    reference: vector<u8>,
    ctx: &mut TxContext,
) {
    let mut wallet = Wallet<T> { id: object::new(ctx), owner, funds: balance::zero() };
    event::emit(WalletOpened { wallet_id: object::id(&wallet), owner });
    deposit(&mut wallet, payment, reference);
    transfer::share_object(wallet);
}

/// The one way funds leave the book, and they can only go to the owner.
public fun withdraw<T>(
    _: &OperatorCap,
    wallet: &mut Wallet<T>,
    amount: u64,
    reference: vector<u8>,
    ctx: &mut TxContext,
) {
    let funds = take(wallet, amount);
    event::emit(FundsWithdrawn { wallet_id: object::id(wallet), owner: wallet.owner, amount, reference });
    transfer::public_transfer(coin::from_balance(funds, ctx), wallet.owner);
}

/// The only entrance a pause closes (docs/10-flows.md flow 11).
public fun hold<T>(
    _: &OperatorCap,
    config: &Config,
    wallet: &mut Wallet<T>,
    hold_key: vector<u8>,
    amount: u64,
    reference: vector<u8>,
    ctx: &mut TxContext,
) {
    config.assert_not_paused();
    assert!(!hold_key.is_empty(), EEmptyKey);
    let funds = take(wallet, amount);
    let hold = FundsHold<T> {
        id: object::new(ctx),
        hold_key,
        owner: wallet.owner,
        funds,
        reference,
    };
    event::emit(FundsHeld {
        hold_id: object::id(&hold),
        hold_key: hold.hold_key,
        owner: hold.owner,
        amount,
        reference: hold.reference,
    });
    transfer::share_object(hold);
}

/// Pull, not push (rule M8): the owner asks, the money comes home, the hold
/// is gone. Only the owner's own wallet can receive it.
public fun refund_hold<T>(_: &OperatorCap, hold: FundsHold<T>, wallet: &mut Wallet<T>) {
    assert!(wallet.owner == hold.owner, EWrongOwner);
    let (hold_id, hold_key, owner, funds) = open(hold);
    let amount = funds.value();
    wallet.funds.join(funds);
    event::emit(HoldRefunded { hold_id, hold_key, owner, amount });
}

/// Starts a distribution. The returned payout has to be emptied with `pay`
/// and consumed with `finish_release` in this same transaction.
public fun begin_release<T>(_: &OperatorCap, hold: FundsHold<T>, reason: u8): Payout<T> {
    let (hold_id, hold_key, owner, funds) = open(hold);
    event::emit(HoldReleased { hold_id, hold_key, owner, amount: funds.value(), reason });
    Payout { hold_key, funds, reason }
}

public fun pay<T>(payout: &mut Payout<T>, wallet: &mut Wallet<T>, amount: u64) {
    assert!(amount > 0, EZeroAmount);
    assert!(payout.funds.value() >= amount, EInsufficientFunds);
    wallet.funds.join(payout.funds.split(amount));
    event::emit(Paid {
        hold_key: payout.hold_key,
        recipient: wallet.owner,
        amount,
        reason: payout.reason,
    });
}

/// A recipient with no wallet yet gets one holding their share.
public fun pay_new<T>(
    _: &OperatorCap,
    payout: &mut Payout<T>,
    owner: address,
    amount: u64,
    ctx: &mut TxContext,
) {
    let mut wallet = Wallet<T> { id: object::new(ctx), owner, funds: balance::zero() };
    event::emit(WalletOpened { wallet_id: object::id(&wallet), owner });
    pay(payout, &mut wallet, amount);
    transfer::share_object(wallet);
}

/// Aborts unless every unit of the hold went somewhere.
public fun finish_release<T>(payout: Payout<T>) {
    let Payout { hold_key: _, funds, reason: _ } = payout;
    assert!(funds.value() == 0, EPayoutNotEmpty);
    funds.destroy_zero();
}

public fun transfer<T>(
    _: &OperatorCap,
    from: &mut Wallet<T>,
    to: &mut Wallet<T>,
    amount: u64,
    reference: vector<u8>,
    reason: u8,
) {
    let funds = take(from, amount);
    to.funds.join(funds);
    event::emit(FundsTransferred { from: from.owner, to: to.owner, amount, reference, reason });
}

public fun transfer_new<T>(
    _: &OperatorCap,
    from: &mut Wallet<T>,
    to_owner: address,
    amount: u64,
    reference: vector<u8>,
    reason: u8,
    ctx: &mut TxContext,
) {
    let funds = take(from, amount);
    let to = Wallet<T> { id: object::new(ctx), owner: to_owner, funds };
    event::emit(WalletOpened { wallet_id: object::id(&to), owner: to_owner });
    event::emit(FundsTransferred { from: from.owner, to: to_owner, amount, reference, reason });
    share_wallet(to);
}

public fun owner<T>(wallet: &Wallet<T>): address { wallet.owner }

public fun balance<T>(wallet: &Wallet<T>): u64 { wallet.funds.value() }

public fun hold_key<T>(hold: &FundsHold<T>): &vector<u8> { &hold.hold_key }

public fun hold_owner<T>(hold: &FundsHold<T>): address { hold.owner }

public fun hold_amount<T>(hold: &FundsHold<T>): u64 { hold.funds.value() }

public fun hold_reference<T>(hold: &FundsHold<T>): &vector<u8> { &hold.reference }

public fun payout_remaining<T>(payout: &Payout<T>): u64 { payout.funds.value() }

fun share_wallet<T>(wallet: Wallet<T>) {
    event::emit(WalletOpened { wallet_id: object::id(&wallet), owner: wallet.owner });
    transfer::share_object(wallet);
}

fun take<T>(wallet: &mut Wallet<T>, amount: u64): Balance<T> {
    assert!(amount > 0, EZeroAmount);
    assert!(wallet.funds.value() >= amount, EInsufficientFunds);
    wallet.funds.split(amount)
}

fun open<T>(hold: FundsHold<T>): (ID, vector<u8>, address, Balance<T>) {
    let FundsHold { id, hold_key, owner, funds, reference: _ } = hold;
    let hold_id = id.to_inner();
    id.delete();
    (hold_id, hold_key, owner, funds)
}
