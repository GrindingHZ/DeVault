#[test_only]
module depawn::config_tests;

use depawn::config::{Self, AdminCap, Config, CustodianCap, OperatorCap, SystemPaused, SystemUnpaused};
use sui::clock;
use sui::event;
use sui::test_scenario;

const PUBLISHER: address = @0xAD;

#[test]
fun init_hands_three_capabilities_to_the_publisher_and_shares_a_running_config() {
    let mut scenario = test_scenario::begin(PUBLISHER);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(PUBLISHER);

    let admin = scenario.take_from_sender<AdminCap>();
    let operator = scenario.take_from_sender<OperatorCap>();
    let custodian = scenario.take_from_sender<CustodianCap>();
    let config = scenario.take_shared<Config>();

    assert!(!config.is_paused());
    assert!(config.parameters().origination_fee_bps() == 200);
    assert!(config.parameters().max_loan_to_value_bps().length() == 5);
    assert!(config.parameters().max_loan_to_value_bps()[0] == 6_000);

    scenario.return_to_sender(admin);
    scenario.return_to_sender(operator);
    scenario.return_to_sender(custodian);
    test_scenario::return_shared(config);
    scenario.end();
}

#[test]
fun pause_sets_the_flag_and_stamps_the_clock_once() {
    let mut scenario = test_scenario::begin(PUBLISHER);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(PUBLISHER);
    let admin = scenario.take_from_sender<AdminCap>();
    let mut config = scenario.take_shared<Config>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_000);

    config::pause(&admin, &mut config, &clock);
    clock.set_for_testing(2_000);
    config::pause(&admin, &mut config, &clock);

    assert!(config.is_paused());
    assert!(config.paused_at_ms() == 1_000);
    assert!(event::events_by_type<SystemPaused>().length() == 1);

    config::unpause(&admin, &mut config, &clock);
    config::unpause(&admin, &mut config, &clock);
    assert!(!config.is_paused());
    assert!(config.paused_at_ms() == 0);
    assert!(event::events_by_type<SystemUnpaused>().length() == 1);

    clock.destroy_for_testing();
    scenario.return_to_sender(admin);
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = config::EPaused)]
fun assert_not_paused_aborts_while_paused() {
    let mut scenario = test_scenario::begin(PUBLISHER);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(PUBLISHER);
    let admin = scenario.take_from_sender<AdminCap>();
    let mut config = scenario.take_shared<Config>();
    let clock = clock::create_for_testing(scenario.ctx());

    config::pause(&admin, &mut config, &clock);
    config::assert_not_paused(&config);

    clock.destroy_for_testing();
    scenario.return_to_sender(admin);
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = config::EBadParameters)]
fun a_fee_above_the_whole_is_refused() {
    config::new_parameters(vector[6_000], 4_800, 600_000, 10_001, 200, 1, 1, true, 0);
}

#[test, expected_failure(abort_code = config::EBadParameters)]
fun a_loan_to_value_cap_above_the_whole_is_refused() {
    config::new_parameters(vector[6_000, 10_001], 4_800, 600_000, 200, 200, 1, 1, true, 0);
}

#[test]
fun set_parameters_replaces_the_whole_struct() {
    let mut scenario = test_scenario::begin(PUBLISHER);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(PUBLISHER);
    let admin = scenario.take_from_sender<AdminCap>();
    let mut config = scenario.take_shared<Config>();

    let parameters = config::new_parameters(
        vector[5_000, 4_000, 3_000, 2_000, 1_000],
        3_600,
        300_000,
        150,
        250,
        86_400_000,
        1_209_600_000,
        false,
        1_700_000_000_000,
    );
    config::set_parameters(&admin, &mut config, parameters);

    assert!(config.parameters().origination_fee_bps() == 150);
    assert!(config.parameters().liquidation_fee_bps() == 250);
    assert!(config.parameters().max_annual_percentage_rate_bps() == 3_600);
    assert!(config.parameters().minimum_offer_lifetime_ms() == 300_000);
    assert!(config.parameters().grace_period_ms() == 86_400_000);
    assert!(config.parameters().statutory_holding_period_ms() == 1_209_600_000);
    assert!(!config.parameters().notes_transferable());
    assert!(config.parameters().effective_at_ms() == 1_700_000_000_000);
    assert!(config.parameters().max_loan_to_value_bps()[4] == 1_000);

    scenario.return_to_sender(admin);
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = config::EBadParameters)]
fun a_liquidation_fee_above_the_whole_is_refused() {
    config::new_parameters(vector[6_000], 4_800, 600_000, 200, 10_001, 1, 1, true, 0);
}
