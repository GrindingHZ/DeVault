#[test_only]
module depawn::market_tests;

use depawn::market::{Self, PositionListing};
use depawn::notes::{Self, LenderNote};
use depawn::usdc::USDC;
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self, Scenario};

const SELLER: address = @0x1E;
const BUYER: address = @0x2E;

const ASK: u64 = 410_000;

fun a_pledge_id(): ID { object::id_from_address(@0xABC) }

fun begin_with_listing(): Scenario {
    let mut scenario = test_scenario::begin(SELLER);
    let note = notes::mint_lender_note(a_pledge_id(), 400_000, 3600, 0, 100, SELLER, scenario.ctx());
    market::list_position<USDC>(note, ASK, scenario.ctx());
    scenario.next_tx(SELLER);
    scenario
}

#[test]
fun buy_position_swaps_the_note_for_the_coin() {
    let mut scenario = begin_with_listing();
    scenario.next_tx(BUYER);
    let listing = scenario.take_shared<PositionListing<USDC>>();
    let payment = coin::mint_for_testing<USDC>(ASK, scenario.ctx());
    market::buy_position(listing, payment, scenario.ctx());

    scenario.next_tx(BUYER);
    let bought = scenario.take_from_sender<LenderNote>();
    assert!(bought.lender_note_pledge() == a_pledge_id());
    scenario.return_to_sender(bought);

    scenario.next_tx(SELLER);
    let proceeds = scenario.take_from_sender<Coin<USDC>>();
    assert!(proceeds.value() == ASK);
    scenario.return_to_sender(proceeds);
    scenario.end();
}

#[test, expected_failure(abort_code = market::EBelowAsk)]
fun buy_position_rejects_underpayment() {
    let mut scenario = begin_with_listing();
    scenario.next_tx(BUYER);
    let listing = scenario.take_shared<PositionListing<USDC>>();
    let payment = coin::mint_for_testing<USDC>(ASK - 1, scenario.ctx());
    market::buy_position(listing, payment, scenario.ctx());
    scenario.end();
}

#[test]
fun delist_returns_the_note_to_the_seller() {
    let mut scenario = begin_with_listing();
    let listing = scenario.take_shared<PositionListing<USDC>>();
    market::delist_position(listing, scenario.ctx());
    scenario.next_tx(SELLER);
    assert!(test_scenario::has_most_recent_for_address<LenderNote>(SELLER));
    scenario.end();
}

#[test, expected_failure(abort_code = market::ENotSeller)]
fun delist_rejects_a_stranger() {
    let mut scenario = begin_with_listing();
    scenario.next_tx(BUYER);
    let listing = scenario.take_shared<PositionListing<USDC>>();
    market::delist_position(listing, scenario.ctx());
    scenario.end();
}
