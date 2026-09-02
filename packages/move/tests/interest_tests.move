#[test_only]
module depawn::interest_tests;

use depawn::interest;

// The value cases live in interest_fixtures_tests.move, generated from the
// shared fixture file; what stays here is the relation a fixture cannot say.

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
fun amount_due_adds_the_principal() {
    assert!(interest::amount_due(1_000_000, 1_800, 0, YEAR_MS, YEAR_MS) == 1_180_000);
}
