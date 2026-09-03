#[test_only]
module depawn::escrow_tests;

use depawn::config::{Self, Config};
use depawn::escrow::{Self, FundsHold};
use depawn::usdc::USDC;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self, Scenario};

const LENDER: address = @0x1E;

const NOW: u64 = 1_000_000;

fun a_pledge_id(): ID { object::id_from_address(@0xDEAD) }

fun begin(): Scenario {
    let mut scenario = test_scenario::begin(LENDER);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(LENDER);
    scenario
}

/// Makes an offer of `amount` against `a_pledge_id()` at the earliest expiry
/// the minimum lifetime allows, leaving the shared hold ready to take.
fun offer(scenario: &mut Scenario, amount: u64) {
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let payment = coin::mint_for_testing<USDC>(amount, scenario.ctx());
    escrow::make_offer(&config, a_pledge_id(), b"HOLD-1", payment, NOW + minimum, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.next_tx(LENDER);
}

#[test]
fun make_offer_locks_the_lenders_coin() {
    let mut scenario = begin();
    offer(&mut scenario, 400_000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    assert!(hold.hold_amount() == 400_000);
    assert!(hold.hold_owner() == LENDER);
    assert!(hold.hold_pledge_id() == a_pledge_id());
    test_scenario::return_shared(hold);
    scenario.end();
}

#[test]
fun refund_expired_returns_the_coin_to_the_owner() {
    let mut scenario = begin();
    offer(&mut scenario, 400_000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    let config = scenario.take_shared<Config>();
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW + minimum);
    escrow::refund_expired(hold, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.next_tx(LENDER);
    let refunded = scenario.take_from_sender<Coin<USDC>>();
    assert!(refunded.value() == 400_000);
    scenario.return_to_sender(refunded);
    scenario.end();
}

#[test]
fun refund_losing_returns_the_coin_when_another_hold_won() {
    let mut scenario = begin();
    offer(&mut scenario, 400_000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    escrow::refund_losing(hold, true, b"HOLD-2", scenario.ctx());
    scenario.next_tx(LENDER);
    let refunded = scenario.take_from_sender<Coin<USDC>>();
    assert!(refunded.value() == 400_000);
    scenario.return_to_sender(refunded);
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EStillOpen)]
fun refund_losing_rejects_while_still_open() {
    let mut scenario = begin();
    offer(&mut scenario, 400_000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    escrow::refund_losing(hold, false, b"", scenario.ctx());
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EWon)]
fun refund_losing_rejects_the_winner() {
    let mut scenario = begin();
    offer(&mut scenario, 400_000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    escrow::refund_losing(hold, true, b"HOLD-1", scenario.ctx());
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EOfferTooShort)]
fun make_offer_rejects_a_short_expiry() {
    let mut scenario = begin();
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let payment = coin::mint_for_testing<USDC>(400_000, scenario.ctx());
    escrow::make_offer(&config, a_pledge_id(), b"HOLD-1", payment, NOW, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EZeroAmount)]
fun make_offer_rejects_a_zero_coin() {
    let mut scenario = begin();
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let payment = coin::mint_for_testing<USDC>(0, scenario.ctx());
    escrow::make_offer(&config, a_pledge_id(), b"HOLD-1", payment, NOW + minimum, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EEmptyKey)]
fun make_offer_rejects_an_empty_key() {
    let mut scenario = begin();
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let payment = coin::mint_for_testing<USDC>(400_000, scenario.ctx());
    escrow::make_offer(&config, a_pledge_id(), b"", payment, NOW + minimum, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.end();
}
