#[test_only]
module depawn::interest_tests;

use depawn::interest;

const DAY_MS: u64 = 86_400_000;
const YEAR_MS: u64 = 31_536_000_000;
const STARTED_AT_MS: u64 = 1_700_000_000_000;

#[test]
fun stops_accruing_at_maturity() {
    let matures_at_ms = STARTED_AT_MS + 30 * DAY_MS;
    let at_maturity = interest::accrued(250_000, 1_800, STARTED_AT_MS, matures_at_ms, matures_at_ms);
    let well_past = interest::accrued(
        250_000,
        1_800,
        STARTED_AT_MS,
        matures_at_ms,
        matures_at_ms + 90 * DAY_MS,
    );
    assert!(well_past == at_maturity);
    assert!(at_maturity > 0);
}

#[test]
fun accrues_nothing_before_origination() {
    let matures_at_ms = STARTED_AT_MS + 30 * DAY_MS;
    assert!(interest::accrued(250_000, 1_800, STARTED_AT_MS, matures_at_ms, STARTED_AT_MS - DAY_MS) == 0);
}

#[test]
fun does_not_overflow_on_a_large_principal_held_for_a_full_term() {
    assert!(interest::accrued(10_000_000_000, 2_400, 0, YEAR_MS, YEAR_MS) == 2_400_000_000);
}

#[test]
fun amount_due_adds_the_principal() {
    assert!(interest::amount_due(1_000_000, 1_800, 0, YEAR_MS, YEAR_MS) == 1_180_000);
}
