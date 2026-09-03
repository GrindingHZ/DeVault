import { describe, expect, it } from 'vitest';
import { SystemPaused } from '../../domain/shared/system-paused';
import { domainErrorForAbort } from './chain-abort-codes';
import { simulatedMoveAbortOf } from './chain-submitter';

/* The build time abort is the shape that actually occurs: the SDK simulates
   the block to resolve objects and estimate gas, and a Move abort there is
   prose in an error message rather than a failed transaction. */
describe('simulatedMoveAbortOf', () => {
  const message =
    "Transaction resolution failed: MoveAbort in 1st command, abort code: 0, in '0x16e286ad97a332e18c666dbed3218b2e70964e644f67e1f1f389a31b5cfbece2::escrow::make_offer' (instruction 19)";

  it('reads the module, the function and the code out of the message', () => {
    expect(simulatedMoveAbortOf(message)).toEqual({
      module: 'escrow',
      functionName: 'make_offer',
      abortCode: 0n,
    });
  });

  it('leaves an escrow abort as a generic failure, since the api pre checks its inputs', () => {
    const abort = simulatedMoveAbortOf(message);
    expect(abort === null ? null : domainErrorForAbort(abort)).toBeNull();
  });

  it('maps a paused config onto the pause error', () => {
    const paused = simulatedMoveAbortOf(
      "MoveAbort in 2nd command, abort code: 1, in '0xabc::config::assert_not_paused' (instruction 3)",
    );
    expect(paused === null ? null : domainErrorForAbort(paused)).toBeInstanceOf(SystemPaused);
  });

  it('answers null for anything that is not an abort', () => {
    expect(simulatedMoveAbortOf('Transaction resolution failed: object not found')).toBeNull();
  });
});
