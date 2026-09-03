#[test_only]
module depawn::pledge_tests;

use depawn::config::{Self, CustodianCap};
use depawn::custody::{Self, VaultReceipt};
use depawn::pledge::{Self, Pledge};
use depawn::usdc::USDC;
use sui::clock;
use sui::test_scenario::{Self, Scenario};

const CUSTODIAN: address = @0xC0;
const BORROWER: address = @0xB0;
const STRANGER: address = @0x5A;

fun mint_receipt_to(scenario: &mut Scenario, holder: address) {
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_000);
    custody::issue(&cap, b"01RECEIPT", b"VAULT-1", holder, b"h", 500_000, 0, 0, b"P", &clock, scenario.ctx());
    clock.destroy_for_testing();
    scenario.return_to_sender(cap);
}

fun begin_with_open_pledge(): Scenario {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    mint_receipt_to(&mut scenario, BORROWER);
    scenario.next_tx(BORROWER);
    let receipt = scenario.take_from_sender<VaultReceipt>();
    pledge::open<USDC>(receipt, 3600, scenario.ctx());
    scenario.next_tx(BORROWER);
    scenario
}

#[test]
fun open_wraps_the_receipt_and_shares_an_open_pledge() {
    let scenario = begin_with_open_pledge();
    let pledge = scenario.take_shared<Pledge<USDC>>();
    assert!(pledge.borrower() == BORROWER);
    assert!(pledge.is_open());
    assert!(pledge.requested_apr_bps() == 3600);
    test_scenario::return_shared(pledge);
    scenario.end();
}

#[test]
fun cancel_returns_the_receipt_to_the_borrower() {
    let mut scenario = begin_with_open_pledge();
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());
    scenario.next_tx(BORROWER);
    assert!(test_scenario::has_most_recent_for_address<VaultReceipt>(BORROWER));
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotBorrower)]
fun cancel_rejects_a_stranger() {
    let mut scenario = begin_with_open_pledge();
    scenario.next_tx(STRANGER);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());
    scenario.end();
}
