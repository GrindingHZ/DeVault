#[test_only]
module depawn::attestation_tests;

use depawn::attestation::{Self, DomainEventAttested};
use depawn::config::{Self, OperatorCap};
use sui::clock;
use sui::event;
use sui::test_scenario;

const OPERATOR: address = @0x0E;

#[test]
fun an_attestation_carries_every_field_and_the_clock() {
    let mut scenario = test_scenario::begin(OPERATOR);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(OPERATOR);
    let operator = scenario.take_from_sender<OperatorCap>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_700_000_000_000);

    attestation::attest(&operator, b"loan", b"01LOAN", b"LoanOriginated", b"{\"loanId\":\"01LOAN\"}", &clock);

    let attested = event::events_by_type<DomainEventAttested>();
    assert!(attested.length() == 1);
    clock.destroy_for_testing();
    scenario.return_to_sender(operator);
    scenario.end();
}

#[test, expected_failure(abort_code = attestation::EEmptyEventType)]
fun an_attestation_without_an_event_type_is_refused() {
    let mut scenario = test_scenario::begin(OPERATOR);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(OPERATOR);
    let operator = scenario.take_from_sender<OperatorCap>();
    let clock = clock::create_for_testing(scenario.ctx());
    attestation::attest(&operator, b"loan", b"01LOAN", b"", b"{}", &clock);
    clock.destroy_for_testing();
    scenario.return_to_sender(operator);
    scenario.end();
}
