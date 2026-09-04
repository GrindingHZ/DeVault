/// The market's state machines run in the api. Every transition they make is
/// written here, in the same transaction as the settlement it belongs to, so
/// the chain carries the whole history of the book and not only the money.
module depawn::attestation;

use depawn::config::OperatorCap;
use sui::clock::Clock;
use sui::event;

const EEmptyEventType: u64 = 0;

/// `event_type` is the domain event name character for character, and
/// `payload` is the same JSON the outbox stores, with a reference to the
/// settling transaction written as `self` because a digest cannot appear in
/// its own events.
public struct DomainEventAttested has copy, drop {
    subject_type: vector<u8>,
    subject_id: vector<u8>,
    event_type: vector<u8>,
    payload: vector<u8>,
    at_ms: u64,
}

public fun attest(
    _: &OperatorCap,
    subject_type: vector<u8>,
    subject_id: vector<u8>,
    event_type: vector<u8>,
    payload: vector<u8>,
    clock: &Clock,
) {
    assert!(!event_type.is_empty(), EEmptyEventType);
    event::emit(DomainEventAttested {
        subject_type,
        subject_id,
        event_type,
        payload,
        at_ms: clock.timestamp_ms(),
    });
}
