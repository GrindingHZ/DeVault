import { ReceiptNotEncumbered } from '../../domain/custody/receipt-not-encumbered';
import { ReceiptNotInVault } from '../../domain/custody/receipt-not-in-vault';
import { InsufficientFunds } from '../../domain/ledger/insufficient-funds';
import type { DomainError } from '../../domain/shared/domain-error';
import { SystemPaused } from '../../domain/shared/system-paused';
import type { MoveAbortDetail } from './chain-execution';

/* The abort constants of each Move module, one for one with the sources in
   packages/move. A unit test reads the sources and refuses a drift. */
export const moveAbortCodes = {
  config: { EBadParameters: 0n, EPaused: 1n },
  custody: { ENotInVault: 0n, ENotEncumbered: 1n, EEmptyKey: 2n, EZeroValue: 3n },
  escrow: {
    EInsufficientFunds: 0n,
    EWrongOwner: 1n,
    EPayoutNotEmpty: 2n,
    EZeroAmount: 3n,
    EEmptyKey: 4n,
  },
  attestation: { EEmptyEventType: 0n },
} as const;

/* The aborts a domain error already names. The adapters pre check their
   projections so these are backstops; anything else is a fault. A receipt
   the chain no longer has is the burned one, which is why the custody
   codes read as they do. */
export function domainErrorForAbort(abort: MoveAbortDetail): DomainError | null {
  if (abort.module === null || abort.abortCode === null) {
    return null;
  }
  const code = abort.abortCode;
  switch (abort.module) {
    case 'escrow':
      return code === moveAbortCodes.escrow.EInsufficientFunds ? new InsufficientFunds() : null;
    case 'config':
      return code === moveAbortCodes.config.EPaused ? new SystemPaused() : null;
    case 'custody':
      if (code === moveAbortCodes.custody.ENotInVault) {
        return new ReceiptNotInVault();
      }
      if (code === moveAbortCodes.custody.ENotEncumbered) {
        return new ReceiptNotEncumbered();
      }
      return null;
    default:
      return null;
  }
}
