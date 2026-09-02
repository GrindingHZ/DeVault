/// The vault's attestation of title. A receipt is a shared object with a
/// holder field rather than an object the holder owns, because a liquidation
/// can run after a lender has claimed the item and an operator cannot take an
/// object another address owns. Every mutation takes the custodian's
/// capability: the vault is the custodian of record for everything it holds
/// (docs/superpowers/specs/2026-08-25-web3-migration-design.md).
module depawn::custody;

use depawn::config::CustodianCap;
use sui::clock::Clock;
use sui::event;

const ENotInVault: u64 = 0;
const ENotEncumbered: u64 = 1;
const EEmptyKey: u64 = 2;
const EZeroValue: u64 = 3;

const IN_VAULT: u8 = 0;
const ENCUMBERED: u8 = 1;

/// The item's twin. `receipt_key` is the api's receipt id, so every event
/// names what the api names; the evidence stays off chain behind
/// `intake_hash` (docs/10-flows.md flow 16). `appraised_value` is in the
/// settlement coin's base units, scaled by the api's codec.
public struct VaultReceipt has key {
    id: UID,
    receipt_key: vector<u8>,
    vault: vector<u8>,
    holder: address,
    intake_hash: vector<u8>,
    appraised_value: u64,
    appraised_at_ms: u64,
    item_category: u8,
    insurance_reference: vector<u8>,
    status: u8,
    encumbered_by: vector<u8>,
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

public struct ReceiptTransferred has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    from: address,
    to: address,
}

public struct ReceiptEncumbered has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    loan_key: vector<u8>,
}

public struct EncumbranceReleased has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    loan_key: vector<u8>,
}

public struct ReceiptClaimedByLender has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    loan_key: vector<u8>,
    claimant: address,
}

public struct RedemptionRequested has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    holder: address,
}

public struct ReceiptLiquidated has copy, drop {
    receipt_id: ID,
    receipt_key: vector<u8>,
    holder: address,
}

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
        holder,
        intake_hash,
        appraised_value,
        appraised_at_ms,
        item_category,
        insurance_reference,
        status: IN_VAULT,
        encumbered_by: vector[],
        issued_at_ms: clock.timestamp_ms(),
    };
    emit_issued(&receipt);
    transfer::share_object(receipt);
}

public fun transfer_holder(_: &CustodianCap, receipt: &mut VaultReceipt, to: address) {
    assert!(receipt.status == IN_VAULT, ENotInVault);
    let from = receipt.holder;
    receipt.holder = to;
    event::emit(ReceiptTransferred {
        receipt_id: object::id(receipt),
        receipt_key: receipt.receipt_key,
        from,
        to,
    });
}

public fun encumber(_: &CustodianCap, receipt: &mut VaultReceipt, loan_key: vector<u8>) {
    assert!(receipt.status == IN_VAULT, ENotInVault);
    assert!(!loan_key.is_empty(), EEmptyKey);
    receipt.status = ENCUMBERED;
    receipt.encumbered_by = loan_key;
    event::emit(ReceiptEncumbered {
        receipt_id: object::id(receipt),
        receipt_key: receipt.receipt_key,
        loan_key,
    });
}

public fun release_encumbrance(_: &CustodianCap, receipt: &mut VaultReceipt) {
    assert!(receipt.status == ENCUMBERED, ENotEncumbered);
    let loan_key = receipt.encumbered_by;
    receipt.status = IN_VAULT;
    receipt.encumbered_by = vector[];
    event::emit(EncumbranceReleased {
        receipt_id: object::id(receipt),
        receipt_key: receipt.receipt_key,
        loan_key,
    });
}

/// Lands in the vault under the claimant rather than staying encumbered, so
/// the lender who took the collateral can redeem it through the ordinary flow
/// (docs/OPEN-QUESTIONS.md Q-012).
public fun claim(_: &CustodianCap, receipt: &mut VaultReceipt, claimant: address) {
    assert!(receipt.status == ENCUMBERED, ENotEncumbered);
    let loan_key = receipt.encumbered_by;
    receipt.status = IN_VAULT;
    receipt.encumbered_by = vector[];
    receipt.holder = claimant;
    event::emit(ReceiptClaimedByLender {
        receipt_id: object::id(receipt),
        receipt_key: receipt.receipt_key,
        loan_key,
        claimant,
    });
}

/// The burn is the entitlement proof and the counter visit is identity
/// verification (docs/10-flows.md flow 6), so the object dies here.
public fun burn_for_redemption(_: &CustodianCap, receipt: VaultReceipt) {
    assert!(receipt.status == IN_VAULT, ENotInVault);
    let (receipt_id, receipt_key, holder) = destroy(receipt);
    event::emit(RedemptionRequested { receipt_id, receipt_key, holder });
}

/// Reachable from both live states because a sale can run before any lender
/// has claimed (docs/14-state-machines.md).
public fun burn_for_liquidation(_: &CustodianCap, receipt: VaultReceipt) {
    let (receipt_id, receipt_key, holder) = destroy(receipt);
    event::emit(ReceiptLiquidated { receipt_id, receipt_key, holder });
}

/// One custody operation, not two: the item never leaves the vault, only the
/// paper changes hands, and every descriptive field carries over so the
/// buyer's receipt shows the same evidence the borrower's did (Q-006).
public fun reissue_to_buyer(
    _: &CustodianCap,
    receipt: VaultReceipt,
    new_receipt_key: vector<u8>,
    buyer: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!new_receipt_key.is_empty(), EEmptyKey);
    let reissued = VaultReceipt {
        id: object::new(ctx),
        receipt_key: new_receipt_key,
        vault: receipt.vault,
        holder: buyer,
        intake_hash: receipt.intake_hash,
        appraised_value: receipt.appraised_value,
        appraised_at_ms: receipt.appraised_at_ms,
        item_category: receipt.item_category,
        insurance_reference: receipt.insurance_reference,
        status: IN_VAULT,
        encumbered_by: vector[],
        issued_at_ms: clock.timestamp_ms(),
    };
    let (receipt_id, receipt_key, holder) = destroy(receipt);
    event::emit(ReceiptLiquidated { receipt_id, receipt_key, holder });
    emit_issued(&reissued);
    transfer::share_object(reissued);
}

public fun receipt_key(receipt: &VaultReceipt): &vector<u8> { &receipt.receipt_key }

public fun vault(receipt: &VaultReceipt): &vector<u8> { &receipt.vault }

public fun holder(receipt: &VaultReceipt): address { receipt.holder }

public fun intake_hash(receipt: &VaultReceipt): &vector<u8> { &receipt.intake_hash }

public fun appraised_value(receipt: &VaultReceipt): u64 { receipt.appraised_value }

public fun item_category(receipt: &VaultReceipt): u8 { receipt.item_category }

public fun status(receipt: &VaultReceipt): u8 { receipt.status }

public fun is_in_vault(receipt: &VaultReceipt): bool { receipt.status == IN_VAULT }

public fun is_encumbered(receipt: &VaultReceipt): bool { receipt.status == ENCUMBERED }

public fun encumbered_by(receipt: &VaultReceipt): &vector<u8> { &receipt.encumbered_by }

public fun issued_at_ms(receipt: &VaultReceipt): u64 { receipt.issued_at_ms }

fun emit_issued(receipt: &VaultReceipt) {
    event::emit(ReceiptIssued {
        receipt_id: object::id(receipt),
        receipt_key: receipt.receipt_key,
        vault: receipt.vault,
        holder: receipt.holder,
        appraised_value: receipt.appraised_value,
        item_category: receipt.item_category,
    });
}

/// `UID` has no drop, so destroying a receipt is spelled out: every other
/// field drops, the id is deleted, and the three the events need come back.
fun destroy(receipt: VaultReceipt): (ID, vector<u8>, address) {
    let VaultReceipt { id, receipt_key, holder, .. } = receipt;
    let receipt_id = id.to_inner();
    id.delete();
    (receipt_id, receipt_key, holder)
}
