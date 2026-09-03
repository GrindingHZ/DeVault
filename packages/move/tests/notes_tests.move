#[test_only]
module depawn::notes_tests;

use depawn::notes;
use sui::test_scenario;

const LENDER: address = @0x1E;
const BORROWER: address = @0xB0;

#[test]
fun a_lender_note_carries_its_terms_and_burns_to_its_pledge() {
    let mut scenario = test_scenario::begin(LENDER);
    let pledge_id = object::id_from_address(@0xABC);
    let note = notes::mint_lender_note(pledge_id, 400_000, 3600, 10, 110, LENDER, scenario.ctx());
    assert!(note.lender_note_pledge() == pledge_id);
    assert!(note.lender_note_principal() == 400_000);
    assert!(note.lender_note_apr_bps() == 3600);
    assert!(note.lender_note_started_at() == 10);
    assert!(note.lender_note_matures_at() == 110);
    assert!(note.lender_note_original_lender() == LENDER);
    notes::burn_lender_note(note);
    scenario.end();
}

#[test]
fun a_borrower_note_carries_its_terms_and_burns_to_its_pledge() {
    let mut scenario = test_scenario::begin(BORROWER);
    let pledge_id = object::id_from_address(@0xDEF);
    let note = notes::mint_borrower_note(pledge_id, 400_000, BORROWER, scenario.ctx());
    assert!(note.borrower_note_pledge() == pledge_id);
    assert!(note.borrower_note_principal() == 400_000);
    assert!(note.borrower_note_original_borrower() == BORROWER);
    notes::burn_borrower_note(note);
    scenario.end();
}
