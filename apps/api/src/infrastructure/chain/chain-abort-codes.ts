import type { DomainError } from '../../domain/shared/domain-error';
import { SystemPaused } from '../../domain/shared/system-paused';
import type { MoveAbortDetail } from './chain-execution';

/* The abort constants of each Move module, one for one with the sources in
   packages/move. A unit test reads the sources and refuses a drift. */
export const moveAbortCodes = {
  config: { EBadParameters: 0n, EPaused: 1n },
  custody: { EEmptyKey: 0n, EZeroValue: 1n },
  escrow: {
    EEmptyKey: 0n,
    EZeroAmount: 1n,
    EOfferTooShort: 2n,
    ENotExpired: 3n,
    EStillOpen: 4n,
    EWon: 5n,
    EZeroRate: 6n,
  },
  attestation: { EEmptyEventType: 0n },
} as const;

/* The aborts a domain error already names. In self-custody the api pre checks
   every input the escrow and custody modules guard, so those aborts should not
   reach a member and carry no domain meaning worth surfacing; a pause is the
   one condition the api cannot pre check, because it can change between the
   build and the signed execution. Anything else is a fault. */
export function domainErrorForAbort(abort: MoveAbortDetail): DomainError | null {
  if (abort.module === null || abort.abortCode === null) {
    return null;
  }
  if (abort.module === 'config' && abort.abortCode === moveAbortCodes.config.EPaused) {
    return new SystemPaused();
  }
  return null;
}
