/// The two positions in a loan, as transferable bearer objects. A LenderNote
/// is owed to whoever holds it; a BorrowerNote redeems the pledged item for
/// whoever holds it. Both carry their terms so a buyer on the secondary
/// market can read the claim from the object itself. Only the pledge module
/// mints and burns them, so a note can exist only for a live loan.
module depawn::notes;

public struct LenderNote has key, store {
    id: UID,
    pledge_id: ID,
    principal: u64,
    apr_bps: u16,
    started_at_ms: u64,
    matures_at_ms: u64,
    original_lender: address,
}

public struct BorrowerNote has key, store {
    id: UID,
    pledge_id: ID,
    principal: u64,
    original_borrower: address,
}

public(package) fun mint_lender_note(
    pledge_id: ID,
    principal: u64,
    apr_bps: u16,
    started_at_ms: u64,
    matures_at_ms: u64,
    lender: address,
    ctx: &mut TxContext,
): LenderNote {
    LenderNote {
        id: object::new(ctx),
        pledge_id,
        principal,
        apr_bps,
        started_at_ms,
        matures_at_ms,
        original_lender: lender,
    }
}

public(package) fun mint_borrower_note(
    pledge_id: ID,
    principal: u64,
    borrower: address,
    ctx: &mut TxContext,
): BorrowerNote {
    BorrowerNote { id: object::new(ctx), pledge_id, principal, original_borrower: borrower }
}

public(package) fun burn_lender_note(note: LenderNote) {
    let LenderNote { id, .. } = note;
    id.delete();
}

public(package) fun burn_borrower_note(note: BorrowerNote) {
    let BorrowerNote { id, .. } = note;
    id.delete();
}

public fun lender_note_id(note: &LenderNote): ID { object::id(note) }

public fun lender_note_pledge(note: &LenderNote): ID { note.pledge_id }

public fun lender_note_principal(note: &LenderNote): u64 { note.principal }

public fun lender_note_apr_bps(note: &LenderNote): u16 { note.apr_bps }

public fun lender_note_started_at(note: &LenderNote): u64 { note.started_at_ms }

public fun lender_note_matures_at(note: &LenderNote): u64 { note.matures_at_ms }

public fun lender_note_original_lender(note: &LenderNote): address { note.original_lender }

public fun borrower_note_id(note: &BorrowerNote): ID { object::id(note) }

public fun borrower_note_pledge(note: &BorrowerNote): ID { note.pledge_id }

public fun borrower_note_principal(note: &BorrowerNote): u64 { note.principal }

public fun borrower_note_original_borrower(note: &BorrowerNote): address { note.original_borrower }
