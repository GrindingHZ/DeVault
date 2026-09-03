#[test_only]
module depawn::pledge_tests;

use depawn::config::{Self, Config, CustodianCap};
use depawn::custody::{Self, VaultReceipt};
use depawn::escrow::{Self, FundsHold};
use depawn::notes::{LenderNote, BorrowerNote};
use depawn::pledge::{Self, Pledge};
use depawn::usdc::USDC;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self, Scenario};

const CUSTODIAN: address = @0xC0;
const BORROWER: address = @0xB0;
const LENDER: address = @0x1E;
const STRANGER: address = @0x5A;

const NOW: u64 = 1_000_000;
const TERM_MS: u64 = 2_592_000_000;
const PRINCIPAL: u64 = 400_000;

fun mint_receipt_to(scenario: &mut Scenario, holder: address) {
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    custody::issue(&cap, b"01RECEIPT", b"VAULT-1", holder, b"h", 500_000, 0, 0, b"P", &clock, scenario.ctx());
    clock.destroy_for_testing();
    scenario.return_to_sender(cap);
}

fun begin_with_open_pledge(apr_bps: u16): Scenario {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    mint_receipt_to(&mut scenario, BORROWER);
    scenario.next_tx(BORROWER);
    let receipt = scenario.take_from_sender<VaultReceipt>();
    pledge::open<USDC>(receipt, apr_bps, scenario.ctx());
    scenario.next_tx(BORROWER);
    scenario
}

fun current_pledge_id(scenario: &Scenario): ID {
    let pledge = scenario.take_shared<Pledge<USDC>>();
    let id = object::id(&pledge);
    test_scenario::return_shared(pledge);
    id
}

fun make_offer_on(scenario: &mut Scenario, pledge_id: ID, hold_key: vector<u8>) {
    scenario.next_tx(LENDER);
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let payment = coin::mint_for_testing<USDC>(PRINCIPAL, scenario.ctx());
    escrow::make_offer(&config, pledge_id, hold_key, payment, NOW + minimum, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    scenario.next_tx(BORROWER);
}

fun accept_current(scenario: &mut Scenario) {
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let hold = scenario.take_shared<FundsHold<USDC>>();
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    pledge::accept(&mut pledge, hold, &config, TERM_MS, &clock, scenario.ctx());
    assert!(pledge.is_active());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    test_scenario::return_shared(pledge);
}

#[test]
fun open_wraps_the_receipt_and_shares_an_open_pledge() {
    let scenario = begin_with_open_pledge(3600);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    assert!(pledge.borrower() == BORROWER);
    assert!(pledge.is_open());
    assert!(pledge.requested_apr_bps() == 3600);
    test_scenario::return_shared(pledge);
    scenario.end();
}

#[test]
fun cancel_returns_the_receipt_to_the_borrower() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());
    scenario.next_tx(BORROWER);
    assert!(test_scenario::has_most_recent_for_address<VaultReceipt>(BORROWER));
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotBorrower)]
fun cancel_rejects_a_stranger() {
    let mut scenario = begin_with_open_pledge(3600);
    scenario.next_tx(STRANGER);
    let pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(pledge, scenario.ctx());
    scenario.end();
}

#[test]
fun accept_disburses_principal_net_of_fee_and_mints_both_notes() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1");
    accept_current(&mut scenario);

    // Fee is 200 bps of the principal; the borrower receives the rest.
    scenario.next_tx(BORROWER);
    let proceeds = scenario.take_from_sender<Coin<USDC>>();
    assert!(proceeds.value() == 392_000);
    scenario.return_to_sender(proceeds);
    let borrower_note = scenario.take_from_sender<BorrowerNote>();
    assert!(borrower_note.borrower_note_pledge() == pledge_id);
    scenario.return_to_sender(borrower_note);

    scenario.next_tx(LENDER);
    let lender_note = scenario.take_from_sender<LenderNote>();
    assert!(lender_note.lender_note_pledge() == pledge_id);
    assert!(lender_note.lender_note_principal() == PRINCIPAL);
    scenario.return_to_sender(lender_note);

    // The fee recipient is the config publisher, the custodian in this test.
    scenario.next_tx(CUSTODIAN);
    let fee = scenario.take_from_sender<Coin<USDC>>();
    assert!(fee.value() == 8_000);
    scenario.return_to_sender(fee);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ERateTooHigh)]
fun accept_rejects_an_apr_over_the_cap() {
    let mut scenario = begin_with_open_pledge(5000);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1");
    accept_current(&mut scenario);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EWrongPledge)]
fun accept_rejects_a_hold_for_another_pledge() {
    let mut scenario = begin_with_open_pledge(3600);
    make_offer_on(&mut scenario, object::id_from_address(@0xDEAD), b"HOLD-1");
    accept_current(&mut scenario);
    scenario.end();
}
