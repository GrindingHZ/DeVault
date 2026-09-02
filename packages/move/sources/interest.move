/// The same arithmetic as `interest-calculator.ts`, line for line: elapsed
/// time clamped at maturity and never negative, the product taken in `u128`
/// because principal times rate times milliseconds passes a `u64` within
/// days, and a truncating division that rounds in the borrower's favour. The
/// generated fixture tests are what keep the two in agreement.
module depawn::interest;

/// A year is 365 days by convention, fixed once (docs/02-domain-model.md).
const MS_PER_YEAR: u128 = 31_536_000_000;
const BASIS_POINTS_IN_WHOLE: u128 = 10_000;

public fun accrued(
    principal: u64,
    annual_percentage_rate_bps: u64,
    started_at_ms: u64,
    matures_at_ms: u64,
    now_ms: u64,
): u64 {
    let elapsed_ms = clamp_elapsed(started_at_ms, matures_at_ms, now_ms);
    let numerator =
        (principal as u128) * (annual_percentage_rate_bps as u128) * (elapsed_ms as u128);
    (numerator / (BASIS_POINTS_IN_WHOLE * MS_PER_YEAR)) as u64
}

public fun amount_due(
    principal: u64,
    annual_percentage_rate_bps: u64,
    started_at_ms: u64,
    matures_at_ms: u64,
    now_ms: u64,
): u64 {
    principal + accrued(principal, annual_percentage_rate_bps, started_at_ms, matures_at_ms, now_ms)
}

/// Interest stops at maturity (rule L1), and a clock reading before
/// origination accrues nothing rather than underflowing.
fun clamp_elapsed(started_at_ms: u64, matures_at_ms: u64, now_ms: u64): u64 {
    if (now_ms < started_at_ms) {
        0
    } else {
        let end_ms = if (now_ms > matures_at_ms) matures_at_ms else now_ms;
        end_ms - started_at_ms
    }
}
