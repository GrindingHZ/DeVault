#[test_only]
module depawn::escrow_tests;

use depawn::config::{Self, AdminCap, Config, OperatorCap};
use depawn::escrow::{Self, FundsHold, Wallet};
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario::{Self, Scenario};

const OPERATOR: address = @0x0E;
const LENDER: address = @0x1E;
const BORROWER: address = @0xB0;
const TREASURY: address = @0x7E;

const ORIGINATE_LOAN: u8 = 3;
const REPAY_LOAN: u8 = 4;

fun begin(): (Scenario, OperatorCap) {
    let mut scenario = test_scenario::begin(OPERATOR);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(OPERATOR);
    let operator = scenario.take_from_sender<OperatorCap>();
    (scenario, operator)
}

fun finish(scenario: Scenario, operator: OperatorCap) {
    scenario.return_to_sender(operator);
    scenario.end();
}

/// Opens a wallet for `owner` holding `amount` in its own transaction and
/// answers its id, because wallets are shared and ownership is a field.
fun fund(scenario: &mut Scenario, operator: &OperatorCap, owner: address, amount: u64): ID {
    let payment = coin::mint_for_testing<SUI>(amount, scenario.ctx());
    escrow::deposit_new(operator, owner, payment, b"seed", scenario.ctx());
    scenario.next_tx(OPERATOR);
    test_scenario::most_recent_id_shared<Wallet<SUI>>().destroy_some()
}

fun hold(scenario: &mut Scenario, operator: &OperatorCap, wallet_id: ID, amount: u64): ID {
    let config = scenario.take_shared<Config>();
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(wallet_id);
    escrow::hold(operator, &config, &mut wallet, b"HOLD-1", amount, b"LISTING-1", scenario.ctx());
    test_scenario::return_shared(wallet);
    test_scenario::return_shared(config);
    scenario.next_tx(OPERATOR);
    test_scenario::most_recent_id_shared<FundsHold<SUI>>().destroy_some()
}

fun balance_of(scenario: &Scenario, wallet_id: ID): u64 {
    let wallet = scenario.take_shared_by_id<Wallet<SUI>>(wallet_id);
    let balance = wallet.balance();
    test_scenario::return_shared(wallet);
    balance
}

#[test]
fun a_hold_makes_the_funds_unavailable_to_the_holder() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 10_000);
    let hold_id = hold(&mut scenario, &operator, lender, 6_000);

    assert!(balance_of(&scenario, lender) == 4_000);
    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    assert!(hold.hold_amount() == 6_000);
    assert!(hold.hold_owner() == LENDER);
    assert!(*hold.hold_key() == b"HOLD-1");
    assert!(*hold.hold_reference() == b"LISTING-1");
    test_scenario::return_shared(hold);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EInsufficientFunds)]
fun a_hold_beyond_the_balance_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 100);
    hold(&mut scenario, &operator, lender, 101);
    finish(scenario, operator);
}

#[test]
fun a_refund_returns_the_funds_and_the_hold_is_gone() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let hold_id = hold(&mut scenario, &operator, lender, 5_000);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::refund_hold(&operator, hold, &mut wallet);
    assert!(wallet.balance() == 5_000);
    test_scenario::return_shared(wallet);
    scenario.next_tx(OPERATOR);
    assert!(!test_scenario::has_most_recent_shared<FundsHold<SUI>>());
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EWrongOwner)]
fun a_refund_into_a_stranger_wallet_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let stranger = open(&mut scenario, &operator, BORROWER);
    let hold_id = hold(&mut scenario, &operator, lender, 5_000);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(stranger);
    escrow::refund_hold(&operator, hold, &mut wallet);
    test_scenario::return_shared(wallet);
    finish(scenario, operator);
}

fun open(scenario: &mut Scenario, operator: &OperatorCap, owner: address): ID {
    escrow::open_wallet<SUI>(operator, owner, scenario.ctx());
    scenario.next_tx(OPERATOR);
    test_scenario::most_recent_id_shared<Wallet<SUI>>().destroy_some()
}

#[test]
fun a_release_paid_to_two_wallets_empties_the_payout() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 10_000);
    let borrower = open(&mut scenario, &operator, BORROWER);
    let treasury = open(&mut scenario, &operator, TREASURY);
    let hold_id = hold(&mut scenario, &operator, lender, 10_000);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    let mut borrower_wallet = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    let mut treasury_wallet = scenario.take_shared_by_id<Wallet<SUI>>(treasury);
    escrow::pay(&mut payout, &mut borrower_wallet, 9_800);
    escrow::pay(&mut payout, &mut treasury_wallet, 200);
    assert!(escrow::payout_remaining(&payout) == 0);
    escrow::finish_release(payout);

    assert!(borrower_wallet.balance() == 9_800);
    assert!(treasury_wallet.balance() == 200);
    test_scenario::return_shared(borrower_wallet);
    test_scenario::return_shared(treasury_wallet);
    assert!(balance_of(&scenario, lender) == 0);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EPayoutNotEmpty)]
fun a_release_with_funds_left_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 10_000);
    let borrower = open(&mut scenario, &operator, BORROWER);
    let hold_id = hold(&mut scenario, &operator, lender, 10_000);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    let mut borrower_wallet = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    escrow::pay(&mut payout, &mut borrower_wallet, 9_000);
    escrow::finish_release(payout);
    test_scenario::return_shared(borrower_wallet);
    finish(scenario, operator);
}

#[test]
fun pay_new_opens_a_wallet_for_a_stranger() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let hold_id = hold(&mut scenario, &operator, lender, 5_000);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    escrow::pay_new(&operator, &mut payout, BORROWER, 5_000, scenario.ctx());
    escrow::finish_release(payout);
    scenario.next_tx(OPERATOR);

    let opened = test_scenario::most_recent_id_shared<Wallet<SUI>>().destroy_some();
    let wallet = scenario.take_shared_by_id<Wallet<SUI>>(opened);
    assert!(wallet.owner() == BORROWER);
    assert!(wallet.balance() == 5_000);
    test_scenario::return_shared(wallet);
    finish(scenario, operator);
}

#[test]
fun transfer_moves_between_wallets_with_a_reason() {
    let (mut scenario, operator) = begin();
    let borrower = fund(&mut scenario, &operator, BORROWER, 5_000);
    let lender = open(&mut scenario, &operator, LENDER);
    let mut from = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    let mut to = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::transfer(&operator, &mut from, &mut to, 3_000, b"LOAN-1", REPAY_LOAN);
    assert!(from.balance() == 2_000);
    assert!(to.balance() == 3_000);
    test_scenario::return_shared(from);
    test_scenario::return_shared(to);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EInsufficientFunds)]
fun a_transfer_beyond_the_balance_is_refused() {
    let (mut scenario, operator) = begin();
    let borrower = fund(&mut scenario, &operator, BORROWER, 100);
    let lender = open(&mut scenario, &operator, LENDER);
    let mut from = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    let mut to = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::transfer(&operator, &mut from, &mut to, 101, b"LOAN-1", REPAY_LOAN);
    test_scenario::return_shared(from);
    test_scenario::return_shared(to);
    finish(scenario, operator);
}

#[test]
fun withdraw_sends_a_coin_to_the_owner_and_nobody_else() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::withdraw(&operator, &mut wallet, 2_000, b"W-1", scenario.ctx());
    assert!(wallet.balance() == 3_000);
    test_scenario::return_shared(wallet);
    scenario.next_tx(LENDER);
    let coin = scenario.take_from_sender<Coin<SUI>>();
    assert!(coin.value() == 2_000);
    scenario.return_to_sender(coin);
    scenario.next_tx(OPERATOR);
    finish(scenario, operator);
}

fun pause(scenario: &mut Scenario) {
    let admin = scenario.take_from_sender<AdminCap>();
    let mut config = scenario.take_shared<Config>();
    let clock = clock::create_for_testing(scenario.ctx());
    config::pause(&admin, &mut config, &clock);
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.return_to_sender(admin);
    scenario.next_tx(OPERATOR);
}

#[test, expected_failure(abort_code = config::EPaused)]
fun a_hold_while_paused_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    pause(&mut scenario);
    hold(&mut scenario, &operator, lender, 5_000);
    finish(scenario, operator);
}

/// Rule S2: a pause closes the entrance and never the exits.
#[test]
fun a_refund_and_a_release_work_while_paused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 10_000);
    let refundable = hold(&mut scenario, &operator, lender, 4_000);
    let releasable = hold(&mut scenario, &operator, lender, 6_000);
    pause(&mut scenario);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(refundable);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::refund_hold(&operator, hold, &mut wallet);
    assert!(wallet.balance() == 4_000);
    test_scenario::return_shared(wallet);

    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(releasable);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    escrow::pay_new(&operator, &mut payout, BORROWER, 6_000, scenario.ctx());
    escrow::finish_release(payout);
    finish(scenario, operator);
}

#[test]
fun transfer_new_opens_exactly_one_wallet_for_the_recipient() {
    let (mut scenario, operator) = begin();
    let borrower = fund(&mut scenario, &operator, BORROWER, 5_000);
    let mut from = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    escrow::transfer_new(&operator, &mut from, LENDER, 3_000, b"LOAN-1", REPAY_LOAN, scenario.ctx());
    assert!(from.balance() == 2_000);
    let opened_events = sui::event::events_by_type<escrow::WalletOpened>();
    assert!(opened_events.length() == 1);
    assert!(sui::event::events_by_type<escrow::FundsTransferred>().length() == 1);
    let opened = escrow::opened_wallet_id(&opened_events[0]);
    test_scenario::return_shared(from);
    scenario.next_tx(OPERATOR);
    let wallet = scenario.take_shared_by_id<Wallet<SUI>>(opened);
    assert!(wallet.owner() == LENDER);
    assert!(wallet.balance() == 3_000);
    test_scenario::return_shared(wallet);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EZeroAmount)]
fun a_zero_deposit_is_refused() {
    let (mut scenario, operator) = begin();
    let payment = coin::mint_for_testing<SUI>(0, scenario.ctx());
    escrow::deposit_new(&operator, LENDER, payment, b"seed", scenario.ctx());
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EZeroAmount)]
fun a_zero_hold_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    hold(&mut scenario, &operator, lender, 0);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EZeroAmount)]
fun a_zero_payment_from_a_payout_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let borrower = open(&mut scenario, &operator, BORROWER);
    let hold_id = hold(&mut scenario, &operator, lender, 5_000);
    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    escrow::pay(&mut payout, &mut wallet, 0);
    escrow::pay(&mut payout, &mut wallet, 5_000);
    escrow::finish_release(payout);
    test_scenario::return_shared(wallet);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EEmptyKey)]
fun a_hold_without_a_key_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let config = scenario.take_shared<Config>();
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(lender);
    escrow::hold(&operator, &config, &mut wallet, b"", 5_000, b"LISTING-1", scenario.ctx());
    test_scenario::return_shared(wallet);
    test_scenario::return_shared(config);
    finish(scenario, operator);
}

#[test, expected_failure(abort_code = escrow::EInsufficientFunds)]
fun a_payment_beyond_the_payout_is_refused() {
    let (mut scenario, operator) = begin();
    let lender = fund(&mut scenario, &operator, LENDER, 5_000);
    let borrower = open(&mut scenario, &operator, BORROWER);
    let hold_id = hold(&mut scenario, &operator, lender, 5_000);
    let hold = scenario.take_shared_by_id<FundsHold<SUI>>(hold_id);
    let mut payout = escrow::begin_release(&operator, hold, ORIGINATE_LOAN);
    let mut wallet = scenario.take_shared_by_id<Wallet<SUI>>(borrower);
    escrow::pay(&mut payout, &mut wallet, 5_001);
    escrow::finish_release(payout);
    test_scenario::return_shared(wallet);
    finish(scenario, operator);
}
