#[test_only]
module depawn::pledge_tests;

use depawn::config::{Self, Config, CustodianCap};
use depawn::custody::{Self, VaultReceipt};
use depawn::escrow::{Self, FundsHold};
use depawn::interest;
use depawn::notes::{LenderNote, BorrowerNote};
use depawn::pledge::{Self, Pledge};
use depawn::usdc::USDC;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self, Scenario};

const CUSTODIAN: address = @0xC0;
const BORROWER: address = @0xB0;
const LENDER: address = @0x1E;
const SECOND_LENDER: address = @0x2E;
const STRANGER: address = @0x5A;

const NOW: u64 = 1_000_000;
const TERM_MS: u64 = 2_592_000_000;
const GRACE_MS: u64 = 604_800_000;
const PRINCIPAL: u64 = 400_000;

fun mint_receipt_to(scenario: &mut Scenario, holder: address) {
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    custody::issue(&cap, b"01RECEIPT", b"VAULT-1", holder, b"h", 1_000_000, 0, 0, b"P", &clock, scenario.ctx());
    clock.destroy_for_testing();
    scenario.return_to_sender(cap);
}

fun open_pledge(scenario: &mut Scenario, apr_bps: u16) {
    mint_receipt_to(scenario, BORROWER);
    scenario.next_tx(BORROWER);
    let receipt = scenario.take_from_sender<VaultReceipt>();
    let config = scenario.take_shared<Config>();
    pledge::open<USDC>(&config, receipt, PRINCIPAL, apr_bps, scenario.ctx());
    test_scenario::return_shared(config);
    scenario.next_tx(BORROWER);
}

fun begin_with_open_pledge(apr_bps: u16): Scenario {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    open_pledge(&mut scenario, apr_bps);
    scenario
}

fun current_pledge_id(scenario: &Scenario): ID {
    let pledge = scenario.take_shared<Pledge<USDC>>();
    let id = object::id(&pledge);
    test_scenario::return_shared(pledge);
    id
}

/// An offer of `amount` at `offer_apr_bps` from `lender`, made against the
/// pledge itself the way a member's transaction does, expiring at the
/// earliest instant the minimum lifetime allows.
fun offer_from(
    scenario: &mut Scenario,
    lender: address,
    pledge_id: ID,
    hold_key: vector<u8>,
    amount: u64,
    offer_apr_bps: u16,
) {
    scenario.next_tx(lender);
    let pledge = scenario.take_shared_by_id<Pledge<USDC>>(pledge_id);
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW);
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    let payment = coin::mint_for_testing<USDC>(amount, scenario.ctx());
    pledge::offer(&config, &pledge, hold_key, payment, offer_apr_bps, NOW + minimum, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    test_scenario::return_shared(pledge);
    scenario.next_tx(BORROWER);
}

fun make_offer_on(scenario: &mut Scenario, pledge_id: ID, hold_key: vector<u8>, offer_apr_bps: u16) {
    offer_from(scenario, LENDER, pledge_id, hold_key, PRINCIPAL, offer_apr_bps);
}

fun accept_current_at(scenario: &mut Scenario, at_ms: u64) {
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let hold = scenario.take_shared<FundsHold<USDC>>();
    let config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(at_ms);
    pledge::accept(&mut pledge, hold, &config, TERM_MS, &clock, scenario.ctx());
    assert!(pledge.is_active());
    clock.destroy_for_testing();
    test_scenario::return_shared(config);
    test_scenario::return_shared(pledge);
}

fun accept_current(scenario: &mut Scenario) {
    accept_current_at(scenario, NOW);
}

fun cancel_current(scenario: &mut Scenario, by: address) {
    scenario.next_tx(by);
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    pledge::cancel(&mut pledge, scenario.ctx());
    test_scenario::return_shared(pledge);
    scenario.next_tx(by);
}

fun refund_losing_against(scenario: &mut Scenario, pledge_id: ID, by: address) {
    scenario.next_tx(by);
    let pledge = scenario.take_shared_by_id<Pledge<USDC>>(pledge_id);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    pledge::refund_losing(&pledge, hold, scenario.ctx());
    test_scenario::return_shared(pledge);
    scenario.next_tx(by);
}

fun begin_with_active_loan(): Scenario {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3600);
    accept_current(&mut scenario);
    scenario
}

fun repay_at(scenario: &mut Scenario, payer: address, at_ms: u64) {
    scenario.next_tx(payer);
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let note = scenario.take_from_sender<BorrowerNote>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(at_ms);
    let payment = coin::mint_for_testing<USDC>(PRINCIPAL * 2, scenario.ctx());
    pledge::repay(&mut pledge, note, payment, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(pledge);
}

fun payoff_at(at_ms: u64): u64 {
    interest::amount_due(PRINCIPAL, 3600, NOW, NOW + TERM_MS, at_ms)
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
fun cancel_returns_the_receipt_and_leaves_the_pledge_as_a_record() {
    let mut scenario = begin_with_open_pledge(3600);
    cancel_current(&mut scenario, BORROWER);
    assert!(test_scenario::has_most_recent_for_address<VaultReceipt>(BORROWER));
    let pledge = scenario.take_shared<Pledge<USDC>>();
    assert!(pledge.is_cancelled());
    assert!(!pledge.is_open());
    test_scenario::return_shared(pledge);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotBorrower)]
fun cancel_rejects_a_stranger() {
    let mut scenario = begin_with_open_pledge(3600);
    cancel_current(&mut scenario, STRANGER);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotOpen)]
fun cancel_rejects_a_funded_listing() {
    let mut scenario = begin_with_active_loan();
    cancel_current(&mut scenario, BORROWER);
    scenario.end();
}

#[test]
fun offer_locks_the_coin_against_the_listing() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    let hold = scenario.take_shared<FundsHold<USDC>>();
    assert!(hold.hold_amount() == PRINCIPAL);
    assert!(hold.hold_owner() == LENDER);
    assert!(hold.hold_pledge_id() == pledge_id);
    test_scenario::return_shared(hold);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotOpen)]
fun offer_rejects_a_cancelled_listing() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    cancel_current(&mut scenario, BORROWER);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ENotOpen)]
fun offer_rejects_a_funded_listing() {
    let mut scenario = begin_with_active_loan();
    scenario.next_tx(BORROWER);
    let pledge_id = current_pledge_id(&scenario);
    offer_from(&mut scenario, SECOND_LENDER, pledge_id, b"HOLD-2", PRINCIPAL, 3000);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ESelfOffer)]
fun offer_rejects_the_borrower() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    offer_from(&mut scenario, BORROWER, pledge_id, b"HOLD-1", PRINCIPAL, 3000);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::ERateTooHigh)]
fun offer_rejects_a_rate_above_the_asked_maximum() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 4000);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EWrongAmount)]
fun offer_rejects_a_coin_that_is_not_the_asked_principal() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    offer_from(&mut scenario, LENDER, pledge_id, b"HOLD-1", PRINCIPAL - 1, 3000);
    scenario.end();
}

#[test]
fun accept_disburses_principal_net_of_fee_and_mints_both_notes() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3600);
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
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3600);
    accept_current(&mut scenario);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EWrongPledge)]
fun accept_rejects_a_hold_for_another_pledge() {
    let mut scenario = begin_with_open_pledge(3600);
    let first = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, first, b"HOLD-1", 3600);
    // A second listing by the same borrower; the hold above is not for it.
    open_pledge(&mut scenario, 3600);
    accept_current(&mut scenario);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EOfferExpired)]
fun accept_rejects_an_offer_past_its_expiry() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3600);
    let config = scenario.take_shared<Config>();
    let minimum = config.parameters().minimum_offer_lifetime_ms();
    test_scenario::return_shared(config);
    scenario.next_tx(BORROWER);
    accept_current_at(&mut scenario, NOW + minimum);
    scenario.end();
}

#[test]
fun an_undercutting_offer_sets_the_loan_rate() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    accept_current(&mut scenario);

    // The loan is charged the offered rate, below the borrower's asked maximum.
    scenario.next_tx(LENDER);
    let lender_note = scenario.take_from_sender<LenderNote>();
    assert!(lender_note.lender_note_apr_bps() == 3000);
    scenario.return_to_sender(lender_note);
    scenario.end();
}

#[test]
fun a_standing_offer_refunds_the_moment_the_listing_is_cancelled() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    cancel_current(&mut scenario, BORROWER);
    // Anyone may trigger the refund; the money can only go to the lender.
    refund_losing_against(&mut scenario, pledge_id, STRANGER);
    scenario.next_tx(LENDER);
    let refunded = scenario.take_from_sender<Coin<USDC>>();
    assert!(refunded.value() == PRINCIPAL);
    scenario.return_to_sender(refunded);
    scenario.end();
}

#[test]
fun a_beaten_offer_refunds_once_another_is_accepted() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    offer_from(&mut scenario, SECOND_LENDER, pledge_id, b"HOLD-2", PRINCIPAL, 3300);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    // The most recent hold is the undercutting one; the borrower accepts it.
    accept_current(&mut scenario);
    refund_losing_against(&mut scenario, pledge_id, SECOND_LENDER);
    let refunded = scenario.take_from_sender<Coin<USDC>>();
    assert!(refunded.value() == PRINCIPAL);
    scenario.return_to_sender(refunded);
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EStillOpen)]
fun refund_losing_rejects_while_the_listing_is_open() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    refund_losing_against(&mut scenario, pledge_id, LENDER);
    scenario.end();
}

#[test, expected_failure(abort_code = escrow::EWon)]
fun refund_losing_rejects_a_hold_carrying_the_winning_key() {
    let mut scenario = begin_with_open_pledge(3600);
    let pledge_id = current_pledge_id(&scenario);
    offer_from(&mut scenario, SECOND_LENDER, pledge_id, b"HOLD-1", PRINCIPAL, 3300);
    make_offer_on(&mut scenario, pledge_id, b"HOLD-1", 3000);
    accept_current(&mut scenario);
    refund_losing_against(&mut scenario, pledge_id, SECOND_LENDER);
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EWrongPledge)]
fun refund_losing_rejects_a_hold_for_another_pledge() {
    let mut scenario = begin_with_open_pledge(3600);
    let first = current_pledge_id(&scenario);
    make_offer_on(&mut scenario, first, b"HOLD-1", 3000);
    open_pledge(&mut scenario, 3600);
    let second = current_pledge_id(&scenario);
    cancel_current(&mut scenario, BORROWER);
    refund_losing_against(&mut scenario, second, LENDER);
    scenario.end();
}

#[test]
fun repay_before_the_cliff_returns_the_receipt_and_parks_the_payoff() {
    let mut scenario = begin_with_active_loan();
    let at = NOW + 1_000;
    repay_at(&mut scenario, BORROWER, at);
    scenario.next_tx(BORROWER);
    assert!(test_scenario::has_most_recent_for_address<VaultReceipt>(BORROWER));
    let pledge = scenario.take_shared<Pledge<USDC>>();
    assert!(pledge.is_repaid());
    test_scenario::return_shared(pledge);
    scenario.end();
}

#[test]
fun collect_pays_the_current_note_holder_and_closes_the_record() {
    let mut scenario = begin_with_active_loan();
    // The lender sells the position to a second lender before repayment.
    scenario.next_tx(LENDER);
    let note = scenario.take_from_sender<LenderNote>();
    transfer::public_transfer(note, SECOND_LENDER);

    let at = NOW + 1_000;
    repay_at(&mut scenario, BORROWER, at);

    scenario.next_tx(SECOND_LENDER);
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let note = scenario.take_from_sender<LenderNote>();
    pledge::collect(&mut pledge, note, scenario.ctx());
    assert!(pledge.is_closed());
    test_scenario::return_shared(pledge);

    scenario.next_tx(SECOND_LENDER);
    let payout = scenario.take_from_sender<Coin<USDC>>();
    assert!(payout.value() == payoff_at(at));
    scenario.return_to_sender(payout);
    // The original lender was paid nothing, because the note moved.
    assert!(!test_scenario::has_most_recent_for_address<Coin<USDC>>(LENDER));
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EPastGrace)]
fun repay_after_the_cliff_aborts() {
    let mut scenario = begin_with_active_loan();
    repay_at(&mut scenario, BORROWER, NOW + TERM_MS + GRACE_MS + 1);
    scenario.end();
}

#[test]
fun claim_after_the_cliff_hands_the_receipt_to_the_note_holder() {
    let mut scenario = begin_with_active_loan();
    scenario.next_tx(LENDER);
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let note = scenario.take_from_sender<LenderNote>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW + TERM_MS + GRACE_MS);
    pledge::claim_default(&mut pledge, note, &clock, scenario.ctx());
    assert!(pledge.is_defaulted());
    clock.destroy_for_testing();
    test_scenario::return_shared(pledge);
    scenario.next_tx(LENDER);
    assert!(test_scenario::has_most_recent_for_address<VaultReceipt>(LENDER));
    scenario.end();
}

#[test, expected_failure(abort_code = pledge::EBeforeGrace)]
fun claim_before_the_cliff_aborts() {
    let mut scenario = begin_with_active_loan();
    scenario.next_tx(LENDER);
    let mut pledge = scenario.take_shared<Pledge<USDC>>();
    let note = scenario.take_from_sender<LenderNote>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(NOW + TERM_MS);
    pledge::claim_default(&mut pledge, note, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(pledge);
    scenario.end();
}
