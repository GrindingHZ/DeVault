// Generated from packages/test-support/src/fixtures/interest.json by
// `pnpm move:fixtures`. Edit the fixture file, not this one.
#[test_only]
module depawn::interest_fixtures_tests;

use depawn::interest;

#[test]
fun returns_zero_at_the_moment_of_origination() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1700000000000,
        ) == 0,
    );
}

#[test]
fun accrues_over_ten_days_of_a_thirty_day_term() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1700864000000,
        ) == 1232,
    );
}

#[test]
fun accrues_over_twenty_days_of_a_thirty_day_term() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1701728000000,
        ) == 2465,
    );
}

#[test]
fun matches_the_closed_form_over_a_full_year() {
    assert!(
        interest::accrued(
            1000000,
            1800,
            0,
            31536000000,
            31536000000,
        ) == 180000,
    );
}

#[test]
fun accrues_at_maturity_itself() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1702592000000,
        ) == 3698,
    );
}

#[test]
fun stops_accruing_at_maturity() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1710368000000,
        ) == 3698,
    );
}

#[test]
fun accrues_nothing_before_origination() {
    assert!(
        interest::accrued(
            250000,
            1800,
            1700000000000,
            1702592000000,
            1699913600000,
        ) == 0,
    );
}

#[test]
fun truncates_in_the_borrower_favour() {
    assert!(
        interest::accrued(
            1,
            1,
            1700000000000,
            1702592000000,
            1700003600000,
        ) == 0,
    );
}

#[test]
fun does_not_overflow_on_a_large_principal_held_for_a_full_term() {
    assert!(
        interest::accrued(
            10000000000,
            2400,
            0,
            31536000000,
            31536000000,
        ) == 2400000000,
    );
}
