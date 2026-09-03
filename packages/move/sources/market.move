/// The secondary market for loan positions, as an atomic swap. Selling a
/// position is transferring the lender note; the borrower is not a party and
/// does not consent. The swap escrows the note in a shared listing so neither
/// side trusts the other: a buyer's coin and the note change hands in one
/// transaction, or none does. This is the same shape as the primary offer
/// (docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md).
module depawn::market;

use depawn::notes::LenderNote;
use sui::coin::Coin;
use sui::event;

const EBelowAsk: u64 = 0;
const ENotSeller: u64 = 1;

public struct PositionListing<phantom T> has key {
    id: UID,
    seller: address,
    ask: u64,
    note: Option<LenderNote>,
}

public struct PositionListed has copy, drop {
    listing_id: ID,
    seller: address,
    note_id: ID,
    ask: u64,
}

public struct PositionSold has copy, drop {
    listing_id: ID,
    seller: address,
    buyer: address,
    note_id: ID,
    price: u64,
}

public struct PositionDelisted has copy, drop {
    listing_id: ID,
    seller: address,
    note_id: ID,
}

public fun list_position<T>(note: LenderNote, ask: u64, ctx: &mut TxContext) {
    let listing = PositionListing<T> {
        id: object::new(ctx),
        seller: ctx.sender(),
        ask,
        note: option::some(note),
    };
    event::emit(PositionListed {
        listing_id: object::id(&listing),
        seller: listing.seller,
        note_id: listing.note.borrow().lender_note_id(),
        ask,
    });
    transfer::share_object(listing);
}

/// The buyer pays the whole coin to the seller, so the caller splits the exact
/// ask before buying; a coin below the ask is refused.
public fun buy_position<T>(listing: PositionListing<T>, payment: Coin<T>, ctx: &mut TxContext) {
    assert!(payment.value() >= listing.ask, EBelowAsk);
    let PositionListing { id, seller, ask, mut note } = listing;
    let item = note.extract();
    note.destroy_none();
    let buyer = ctx.sender();
    event::emit(PositionSold {
        listing_id: id.to_inner(),
        seller,
        buyer,
        note_id: item.lender_note_id(),
        price: ask,
    });
    id.delete();
    transfer::public_transfer(item, buyer);
    transfer::public_transfer(payment, seller);
}

public fun delist_position<T>(listing: PositionListing<T>, ctx: &mut TxContext) {
    assert!(listing.seller == ctx.sender(), ENotSeller);
    let PositionListing { id, seller, mut note, .. } = listing;
    let item = note.extract();
    note.destroy_none();
    event::emit(PositionDelisted {
        listing_id: id.to_inner(),
        seller,
        note_id: item.lender_note_id(),
    });
    id.delete();
    transfer::public_transfer(item, seller);
}

public fun seller<T>(listing: &PositionListing<T>): address { listing.seller }

public fun ask<T>(listing: &PositionListing<T>): u64 { listing.ask }
