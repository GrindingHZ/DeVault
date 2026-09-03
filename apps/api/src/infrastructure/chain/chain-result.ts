import type { SuiClientTypes } from '@mysten/sui/client';
import type { DomainError } from '../../domain/shared/domain-error';
import { domainErrorForAbort } from './chain-abort-codes';
import { ChainExecutionFailed } from './chain-execution';
import type { ChainEvent, ChainExecution, MoveAbortDetail } from './chain-execution';

/* The shape of an executed transaction both the operator submitter and the
   sponsored gateway read: only the fields the api projects from. Structural,
   so the SDK's own richer type satisfies it without an import of its name. */
export interface ExecutedTransaction {
  readonly digest: string;
  readonly events?: readonly SuiClientTypes.Event[] | null;
  readonly effects: {
    readonly changedObjects: readonly {
      readonly objectId: string;
      readonly idOperation: string;
    }[];
  };
  readonly objectTypes?: Readonly<Record<string, string>> | null;
}

export function chainEventOf(event: SuiClientTypes.Event): ChainEvent {
  const [, name = ''] = event.eventType.split(/::(?=[^:]+$)/);
  return { type: event.eventType, module: event.module, name, json: event.json ?? {} };
}

export function executionOf(executed: ExecutedTransaction): ChainExecution {
  return {
    digest: executed.digest,
    events: (executed.events ?? []).map(chainEventOf),
    createdObjectIds: executed.effects.changedObjects
      .filter((changed) => changed.idOperation === 'Created')
      .map((changed) => changed.objectId),
    objectTypes: executed.objectTypes ?? {},
  };
}

/* A failed execution becomes the domain error a Move abort names, or a fault
   the caller rolls back on. */
export function failureOf(status: SuiClientTypes.ExecutionStatus): Error | DomainError {
  if (status.success) {
    return new ChainExecutionFailed('The transaction was reported as failed and successful', null);
  }
  const abort = moveAbortOf(status.error);
  if (abort !== null) {
    const domainError = domainErrorForAbort(abort);
    if (domainError !== null) {
      return domainError;
    }
  }
  return new ChainExecutionFailed(`The chain refused the transaction: ${status.error.message}`, abort);
}

function moveAbortOf(error: SuiClientTypes.ExecutionError): MoveAbortDetail | null {
  if (error.$kind !== 'MoveAbort') {
    return null;
  }
  const abort = error.MoveAbort;
  return {
    module: abort.location?.module ?? null,
    functionName: abort.location?.functionName ?? null,
    abortCode: BigInt(abort.abortCode),
  };
}
