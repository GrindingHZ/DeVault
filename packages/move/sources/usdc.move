/// A stand in for Circle's USDC on local networks: six decimals like the real
/// coin, and a treasury capability that plays the platform float. The escrow
/// module is generic over the coin type; on testnet and mainnet the deployment
/// names Circle's own `usdc::USDC` and this module is never instantiated.
module depawn::usdc;

use sui::coin;

public struct USDC has drop {}

/* The registry flow is a two step handshake with a shared registry object.
   A coin that only exists on a local network does not need it, and the
   classic path is one call. */
#[allow(deprecated_usage)]
fun init(witness: USDC, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"USDC",
        b"USDC (local)",
        b"Six decimal stand in for Circle USDC on local networks",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(USDC {}, ctx)
}
