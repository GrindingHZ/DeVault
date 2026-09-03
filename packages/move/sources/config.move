/// The protocol parameters, the pause flag, and the three capabilities that
/// authorise every mutation in the package. Holding a capability is the whole
/// of authorisation on Sui: a function that takes `&AdminCap` can only be
/// called by whoever owns that object (docs/08-web3-migration.md).
module depawn::config;

use sui::clock::Clock;
use sui::event;

const EBadParameters: u64 = 0;
const EPaused: u64 = 1;

const BASIS_POINTS_IN_WHOLE: u16 = 10_000;

/// Parameters and pause. Destined for a multisig.
public struct AdminCap has key, store { id: UID }

/// Day to day settlement: wallets, holds, releases, attestations.
public struct OperatorCap has key, store { id: UID }

/// Custody: issuing, moving and burning receipts.
public struct CustodianCap has key, store { id: UID }

/// The mirror of `ProtocolParameters` in the api. Loan to value caps are
/// indexed by the item category code in `item-category.ts` order.
public struct Parameters has copy, drop, store {
    max_loan_to_value_bps: vector<u16>,
    max_annual_percentage_rate_bps: u16,
    minimum_offer_lifetime_ms: u64,
    origination_fee_bps: u16,
    liquidation_fee_bps: u16,
    grace_period_ms: u64,
    statutory_holding_period_ms: u64,
    notes_transferable: bool,
    effective_at_ms: u64,
}

public struct Config has key {
    id: UID,
    paused: bool,
    paused_at_ms: u64,
    parameters: Parameters,
    fee_recipient: address,
}

public struct SystemPaused has copy, drop { at_ms: u64 }
public struct SystemUnpaused has copy, drop { at_ms: u64 }
public struct ParametersUpdated has copy, drop { parameters: Parameters }

fun init(ctx: &mut TxContext) {
    publish(ctx)
}

/* Init hands the capabilities to whoever published, which is the one place a
   transfer to the sender is the point rather than a missed return value. */
#[allow(lint(self_transfer))]
fun publish(ctx: &mut TxContext) {
    let publisher = ctx.sender();
    transfer::transfer(AdminCap { id: object::new(ctx) }, publisher);
    transfer::transfer(OperatorCap { id: object::new(ctx) }, publisher);
    transfer::transfer(CustodianCap { id: object::new(ctx) }, publisher);
    transfer::share_object(Config {
        id: object::new(ctx),
        paused: false,
        paused_at_ms: 0,
        parameters: demo_parameters(),
        fee_recipient: publisher,
    });
}

/// The defaults in `demo-parameters.ts`, so a fresh deployment and a fresh
/// database agree before an operator has written anything.
public fun demo_parameters(): Parameters {
    new_parameters(
        vector[6_000, 5_000, 4_500, 3_500, 3_000],
        4_800,
        600_000,
        200,
        200,
        604_800_000,
        2_592_000_000,
        true,
        0,
    )
}

/// A share above the whole is not a parameter, it is a typo, and the place
/// to refuse it is before it reaches a stored config.
public fun new_parameters(
    max_loan_to_value_bps: vector<u16>,
    max_annual_percentage_rate_bps: u16,
    minimum_offer_lifetime_ms: u64,
    origination_fee_bps: u16,
    liquidation_fee_bps: u16,
    grace_period_ms: u64,
    statutory_holding_period_ms: u64,
    notes_transferable: bool,
    effective_at_ms: u64,
): Parameters {
    assert!(origination_fee_bps <= BASIS_POINTS_IN_WHOLE, EBadParameters);
    assert!(liquidation_fee_bps <= BASIS_POINTS_IN_WHOLE, EBadParameters);
    max_loan_to_value_bps.do_ref!(|cap| assert!(*cap <= BASIS_POINTS_IN_WHOLE, EBadParameters));
    Parameters {
        max_loan_to_value_bps,
        max_annual_percentage_rate_bps,
        minimum_offer_lifetime_ms,
        origination_fee_bps,
        liquidation_fee_bps,
        grace_period_ms,
        statutory_holding_period_ms,
        notes_transferable,
        effective_at_ms,
    }
}

/// Idempotent, because the api's pause is an upsert and a second press must
/// not make the mirror disagree with the row.
public fun pause(_: &AdminCap, config: &mut Config, clock: &Clock) {
    if (!config.paused) {
        config.paused = true;
        config.paused_at_ms = clock.timestamp_ms();
        event::emit(SystemPaused { at_ms: config.paused_at_ms });
    }
}

public fun unpause(_: &AdminCap, config: &mut Config, clock: &Clock) {
    if (config.paused) {
        config.paused = false;
        config.paused_at_ms = 0;
        event::emit(SystemUnpaused { at_ms: clock.timestamp_ms() });
    }
}

public fun set_parameters(_: &AdminCap, config: &mut Config, parameters: Parameters) {
    config.parameters = parameters;
    event::emit(ParametersUpdated { parameters });
}

/// Rule S2 as a call graph: only `escrow::make_offer` calls this. Refunds,
/// acceptances and redemptions never do, so a pause cannot trap money or
/// collateral.
public fun assert_not_paused(config: &Config) {
    assert!(!config.paused, EPaused);
}

/// Where the origination fee lands. Set to the publisher at genesis; a
/// transfer to a treasury multisig later is a parameter change, not a rewrite.
public fun fee_recipient(config: &Config): address { config.fee_recipient }

public fun is_paused(config: &Config): bool { config.paused }

public fun paused_at_ms(config: &Config): u64 { config.paused_at_ms }

public fun parameters(config: &Config): &Parameters { &config.parameters }

public fun max_loan_to_value_bps(parameters: &Parameters): &vector<u16> {
    &parameters.max_loan_to_value_bps
}

public fun max_annual_percentage_rate_bps(parameters: &Parameters): u16 {
    parameters.max_annual_percentage_rate_bps
}

public fun minimum_offer_lifetime_ms(parameters: &Parameters): u64 {
    parameters.minimum_offer_lifetime_ms
}

public fun origination_fee_bps(parameters: &Parameters): u16 { parameters.origination_fee_bps }

public fun liquidation_fee_bps(parameters: &Parameters): u16 { parameters.liquidation_fee_bps }

public fun grace_period_ms(parameters: &Parameters): u64 { parameters.grace_period_ms }

public fun statutory_holding_period_ms(parameters: &Parameters): u64 {
    parameters.statutory_holding_period_ms
}

public fun notes_transferable(parameters: &Parameters): bool { parameters.notes_transferable }

public fun effective_at_ms(parameters: &Parameters): u64 { parameters.effective_at_ms }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    publish(ctx)
}
