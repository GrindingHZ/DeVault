#[test_only]
module depawn::custody_tests;

use depawn::config::{Self, CustodianCap};
use depawn::custody::{Self, VaultReceipt, ReceiptIssued};
use sui::clock;
use sui::event;
use sui::test_scenario::{Self, Scenario};

const CUSTODIAN: address = @0xC0;
const BORROWER: address = @0xB0;

fun issue(scenario: &mut Scenario, cap: &CustodianCap) {
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_700_000_000_000);
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
        b"https://devault.example/api/v1/receipts/01RECEIPT/photo".to_string(),
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
    scenario.next_tx(BORROWER);
    (scenario, cap)
}

fun finish(scenario: Scenario, cap: CustodianCap) {
    test_scenario::return_to_address(CUSTODIAN, cap);
    scenario.end();
}

#[test]
fun issue_transfers_the_receipt_to_the_borrower() {
    let (scenario, cap) = begin();
    let receipt = scenario.take_from_sender<VaultReceipt>();
    assert!(*receipt.receipt_key() == b"01RECEIPT");
    assert!(receipt.appraised_value() == 500_000);
    assert!(*receipt.intake_hash() == b"sha256:intake");
    assert!(receipt.issued_at_ms() == 1_700_000_000_000);
    scenario.return_to_sender(receipt);
    finish(scenario, cap);
}

/* The wallet showing the receipt has only the object to go on, so the url of
   the item's own photograph rides on it rather than in our database. */
#[test]
fun issue_carries_the_url_of_the_item_photograph() {
    let (scenario, cap) = begin();
    let receipt = scenario.take_from_sender<VaultReceipt>();
    assert!(*receipt.image_url() == b"https://devault.example/api/v1/receipts/01RECEIPT/photo".to_string());
    scenario.return_to_sender(receipt);
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
fun redeem_deletes_the_object() {
    let (mut scenario, cap) = begin();
    let receipt = scenario.take_from_sender<VaultReceipt>();
    custody::redeem(receipt);
    scenario.next_tx(BORROWER);
    assert!(!test_scenario::has_most_recent_for_address<VaultReceipt>(BORROWER));
    finish(scenario, cap);
}

#[test, expected_failure(abort_code = custody::EEmptyKey)]
fun an_empty_receipt_key_is_refused() {
    let mut scenario = test_scenario::begin(CUSTODIAN);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(CUSTODIAN);
    let cap = scenario.take_from_sender<CustodianCap>();
    let clock = clock::create_for_testing(scenario.ctx());
    custody::issue(
        &cap,
        b"",
        b"VAULT-1",
        BORROWER,
        b"h",
        1,
        0,
        0,
        b"P",
        b"".to_string(),
        &clock,
        scenario.ctx(),
    );
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
    custody::issue(
        &cap,
        b"01R",
        b"VAULT-1",
        BORROWER,
        b"h",
        0,
        0,
        0,
        b"P",
        b"".to_string(),
        &clock,
        scenario.ctx(),
    );
    clock.destroy_for_testing();
    finish(scenario, cap);
}
