#[test_only]
module depawn::usdc_tests;

use depawn::usdc::{Self, USDC};
use sui::coin::{Self, TreasuryCap};
use sui::test_scenario;

const PUBLISHER: address = @0xAD;

#[test]
fun init_hands_the_publisher_a_six_decimal_treasury() {
    let mut scenario = test_scenario::begin(PUBLISHER);
    usdc::init_for_testing(scenario.ctx());
    scenario.next_tx(PUBLISHER);
    let mut treasury = scenario.take_from_sender<TreasuryCap<USDC>>();
    let minted = coin::mint(&mut treasury, 1_000_000, scenario.ctx());
    assert!(minted.value() == 1_000_000);
    coin::burn(&mut treasury, minted);
    assert!(treasury.total_supply() == 0);
    scenario.return_to_sender(treasury);
    scenario.end();
}
