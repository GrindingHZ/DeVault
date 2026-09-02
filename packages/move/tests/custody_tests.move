#[test_only]
module depawn::custody_tests;

use depawn::config::{Self, CustodianCap};
use depawn::custody::{Self, VaultReceipt, ReceiptIssued, ReceiptLiquidated};
use sui::clock;
use sui::event;
use sui::test_scenario::{Self, Scenario};

const CUSTODIAN: address = @0xC0;
const BORROWER: address = @0xB0;
const LENDER: address = @0x1E;
const BUYER: address = @0xB1;

fun issue(scenario: &mut Scenario, cap: &CustodianCap) {
    let clock = clock::create_for_testing(scenario.ctx());
    custody::issue(
        cap,
        b"01RECEIPT",
        b"VAULT-1",
        BORROWER,
        b"sha256:intake",
        500_000,
        1_700_000_000_000,
        0,
        b"POL-1",
        &clock,
        scenario.ctx(),
    );
    clock.destroy_for_testing();
}

fun begin(): (Scenario, CustodianCap) {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    issue(&mut scenario, &cap);
    scenario.next_tx(CUSTODIAN);
    (scenario, cap)
}

fun finish(scenario: Scenario, cap: CustodianCap) {
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
fun issue_lands_in_the_vault_under_the_holder() {
    let (scenario, cap) = begin();
    let receipt = scenario.take_shared<VaultReceipt>();
    assert!(receipt.is_in_vault());
    assert!(receipt.holder() == BORROWER);
    assert!(receipt.appraised_value() == 500_000);
    assert!(receipt.encumbered_by().is_empty());
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test]
fun issue_announces_the_receipt() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    issue(&mut scenario, &cap);
    assert!(event::events_by_type<ReceiptIssued>().length() == 1);
    finish(scenario, cap);
}

#[test]
fun encumber_binds_the_loan_key_and_release_clears_it() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    assert!(receipt.is_encumbered());
    assert!(*receipt.encumbered_by() == b"01LOAN");
    custody::release_encumbrance(&cap, &mut receipt);
    assert!(receipt.is_in_vault());
    assert!(receipt.encumbered_by().is_empty());
    assert!(receipt.holder() == BORROWER);
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test]
fun claim_hands_the_receipt_to_the_claimant_in_vault() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    custody::claim(&cap, &mut receipt, LENDER);
    assert!(receipt.is_in_vault());
    assert!(receipt.holder() == LENDER);
    assert!(receipt.encumbered_by().is_empty());
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test]
fun transfer_changes_the_holder_while_in_vault() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::transfer_holder(&cap, &mut receipt, LENDER);
    assert!(receipt.holder() == LENDER);
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::ENotInVault)]
fun transfer_refuses_while_encumbered() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    custody::transfer_holder(&cap, &mut receipt, LENDER);
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::ENotInVault)]
fun encumber_refuses_twice() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    custody::encumber(&cap, &mut receipt, b"02LOAN");
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::ENotEncumbered)]
fun release_refuses_when_not_encumbered() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::release_encumbrance(&cap, &mut receipt);
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::ENotEncumbered)]
fun claim_refuses_collateral_that_is_not_encumbered() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::claim(&cap, &mut receipt, LENDER);
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::ENotInVault)]
fun burn_for_redemption_refuses_while_encumbered() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    custody::burn_for_redemption(&cap, receipt);
    finish(scenario, cap);
}

#[test]
fun burn_for_redemption_deletes_the_object() {
    let (mut scenario, cap) = begin();
    let receipt = scenario.take_shared<VaultReceipt>();
    custody::burn_for_redemption(&cap, receipt);
    scenario.next_tx(CUSTODIAN);
    assert!(!test_scenario::has_most_recent_shared<VaultReceipt>());
    finish(scenario, cap);
}

#[test]
fun burn_for_liquidation_works_from_either_live_state() {
    let (mut scenario, cap) = begin();
    let mut encumbered = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut encumbered, b"01LOAN");
    custody::burn_for_liquidation(&cap, encumbered);
    scenario.next_tx(CUSTODIAN);
    assert!(!test_scenario::has_most_recent_shared<VaultReceipt>());

    issue(&mut scenario, &cap);
    scenario.next_tx(CUSTODIAN);
    let in_vault = scenario.take_shared<VaultReceipt>();
    custody::burn_for_liquidation(&cap, in_vault);
    assert!(event::events_by_type<ReceiptLiquidated>().length() == 1);
    scenario.next_tx(CUSTODIAN);
    assert!(!test_scenario::has_most_recent_shared<VaultReceipt>());
    finish(scenario, cap);
}

#[test]
fun reissue_ends_the_seller_title_and_grants_the_buyer_the_same_item() {
    let (mut scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"01LOAN");
    let old_id = object::id(&receipt);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_800_000_000_000);
    custody::reissue_to_buyer(&cap, receipt, b"02RECEIPT", BUYER, &clock, scenario.ctx());
    clock.destroy_for_testing();
    assert!(event::events_by_type<ReceiptIssued>().length() == 1);
    assert!(event::events_by_type<ReceiptLiquidated>().length() == 1);
    scenario.next_tx(CUSTODIAN);

    let reissued = scenario.take_shared<VaultReceipt>();
    assert!(object::id(&reissued) != old_id);
    assert!(*reissued.receipt_key() == b"02RECEIPT");
    assert!(reissued.holder() == BUYER);
    assert!(reissued.is_in_vault());
    assert!(reissued.encumbered_by().is_empty());
    assert!(*reissued.intake_hash() == b"sha256:intake");
    assert!(reissued.appraised_value() == 500_000);
    assert!(reissued.issued_at_ms() == 1_800_000_000_000);
    test_scenario::return_shared(reissued);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::EEmptyKey)]
fun an_empty_receipt_key_is_refused() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let clock = clock::create_for_testing(scenario.ctx());
    custody::issue(&cap, b"", b"VAULT-1", BORROWER, b"h", 1, 0, 0, b"P", &clock, scenario.ctx());
    clock.destroy_for_testing();
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::EZeroValue)]
fun a_zero_appraisal_is_refused() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let clock = clock::create_for_testing(scenario.ctx());
    custody::issue(&cap, b"01R", b"VAULT-1", BORROWER, b"h", 0, 0, 0, b"P", &clock, scenario.ctx());
    clock.destroy_for_testing();
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::EEmptyKey)]
fun encumbering_without_a_loan_key_is_refused() {
    let (scenario, cap) = begin();
    let mut receipt = scenario.take_shared<VaultReceipt>();
    custody::encumber(&cap, &mut receipt, b"");
    test_scenario::return_shared(receipt);
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::EEmptyKey)]
fun reissuing_without_a_new_key_is_refused() {
    let (mut scenario, cap) = begin();
    let receipt = scenario.take_shared<VaultReceipt>();
    let clock = clock::create_for_testing(scenario.ctx());
    custody::reissue_to_buyer(&cap, receipt, b"", BUYER, &clock, scenario.ctx());
    clock.destroy_for_testing();
    finish(scenario, cap);
}
