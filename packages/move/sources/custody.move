/// The vault's attestation of title, now an object the borrower owns. Intake
/// mints a receipt to the borrower with the custodian's capability, because
/// only a human can vouch that the item is in the vault. After that the
/// receipt is an ordinary owned object: the borrower can transfer it, a
/// `Pledge` can wrap it, and redemption burns it. Nothing here can move a
/// receipt the borrower holds, which is the whole of self-custody
/// (docs/superpowers/specs/2026-08-26-self-custody-loan-book-design.md).
module depawn::custody;

use depawn::config::CustodianCap;
use sui::clock::Clock;
use sui::event;

const EEmptyKey: u64 = 0;
const EZeroValue: u64 = 1;

/// The item's twin. `receipt_key` is the api's receipt id, so every event
/// names what the api names; the evidence stays off chain behind
/// `intake_hash`. `appraised_value` is in the settlement coin's base units.
/// Ownership is the title: whoever holds this object is the owner of record,
/// so there is no `holder` or `status` field to keep in step with it.
public struct VaultReceipt has key, store {
    id: UID,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    intake_hash: vector<u8>,
    appraised_value: u64,
    appraised_at_ms: u64,
    item_category: u8,
    insurance_reference: vector<u8>,
    issued_at_ms: u64,
}

public struct ReceiptIssued has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    holder: address,
    appraised_value: u64,
    item_category: u8,
}

public struct RedemptionRequested has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
}

/// Mints the receipt to the borrower. The one custodial act on the whole
/// path: the capability is the vault's word that the item is really here.
public fun issue(
    _: &CustodianCap,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    holder: address,
    intake_hash: vector<u8>,
    appraised_value: u64,
    appraised_at_ms: u64,
    item_category: u8,
    insurance_reference: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!receipt_key.is_empty(), EEmptyKey);
    assert!(appraised_value > 0, EZeroValue);
    let receipt = VaultReceipt {
        id: object::new(ctx),
        receipt_key,
        vault,
        intake_hash,
        appraised_value,
        appraised_at_ms,
        item_category,
        insurance_reference,
        issued_at_ms: clock.timestamp_ms(),
    };
    event::emit(ReceiptIssued {
        receipt_id: object::id(&receipt),
        receipt_key: receipt.receipt_key,
        vault: receipt.vault,
        holder,
        appraised_value: receipt.appraised_value,
        item_category: receipt.item_category,
    });
    transfer::public_transfer(receipt, holder);
}

/// The holder gives up the claim by burning the receipt; staff read the event
/// and release the item at the counter, where identity is checked. Signed by
/// the holder alone, because one transaction cannot also carry the
/// custodian's capability.
public fun redeem(receipt: VaultReceipt) {
    let VaultReceipt { id, receipt_key, .. } = receipt;
    let receipt_id = id.to_inner();
    id.delete();
    event::emit(RedemptionRequested { receipt_id, receipt_key });
}

public fun receipt_key(receipt: &VaultReceipt): &vector<u8> { &receipt.receipt_key }

public fun vault(receipt: &VaultReceipt): &vector<u8> { &receipt.vault }

public fun intake_hash(receipt: &VaultReceipt): &vector<u8> { &receipt.intake_hash }

public fun appraised_value(receipt: &VaultReceipt): u64 { receipt.appraised_value }

public fun item_category(receipt: &VaultReceipt): u8 { receipt.item_category }

public fun issued_at_ms(receipt: &VaultReceipt): u64 { receipt.issued_at_ms }
