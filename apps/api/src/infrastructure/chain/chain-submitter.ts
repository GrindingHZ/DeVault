import { Logger } from '@nestjs/common';
import { SerialTransactionExecutor } from '@mysten/sui/transactions';
import type { Transaction } from '@mysten/sui/transactions';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { ChainClient } from './chain-client';
import type { DomainError } from '../../domain/shared/domain-error';
import { domainErrorForAbort } from './chain-abort-codes';
import { waitUntilVisible } from './chain-reads';
import { ChainExecutionFailed } from './chain-execution';
import type {
  ChainEvent,
  ChainExecution,
  ChainSubmitter,
  MoveAbortDetail,
} from './chain-execution';
import type { OperatorSigner } from './operator-signer';

/* Signs as the operator and executes through the SDK's serial executor,
   which owns the gas coin cache so two units of work can never build against
   the same coin version and lock it for the epoch (docs/08-web3-migration.md,
   things that will bite). Failure is a value from the SDK and a throw from
   here: a domain error when a Move abort names one, a fault otherwise. */
export class GrpcChainSubmitter implements ChainSubmitter {
  private readonly logger = new Logger(GrpcChainSubmitter.name);
  private readonly executor: SerialTransactionExecutor;

  constructor(
    private readonly client: ChainClient,
    signer: OperatorSigner,
  ) {
    this.executor = new SerialTransactionExecutor({ client, signer: signer.keypair });
  }

  async execute(transaction: Transaction): Promise<ChainExecution> {
    let result;
    try {
      result = await this.executor.executeTransaction(transaction, {
        effects: true,
        events: true,
        objectTypes: true,
      });
    } catch (error: unknown) {
      /* The SDK simulates the block while building it, to resolve objects
         and estimate gas, and an abort there is thrown rather than answered
         as a failed transaction. It names the module and the code in its
         message, which is enough to map it the same way. */
      throw simulationFailureOf(error);
    }
    if (result.$kind === 'FailedTransaction') {
      throw failureOf(result.FailedTransaction.status);
    }
    const executed = result.Transaction;
    /* The executor answers when the validators have executed; reads go to a
       full node that sees the transaction once it is checkpointed. */
    const waitedMs = await waitUntilVisible(
      (signal) => this.client.core.getTransaction({ digest: executed.digest, signal }),
      `transaction ${executed.digest}`,
      (elapsedMs, lastAnswer) =>
        this.logger.warn(
          `transaction ${executed.digest} still not visible after ${elapsedMs}ms; the node answers: ${lastAnswer}`,
        ),
    );
    if (waitedMs > 5_000) {
      this.logger.warn(`transaction ${executed.digest} took ${waitedMs}ms to become visible`);
    }
    return {
      digest: executed.digest,
      events: (executed.events ?? []).map(toChainEvent),
      createdObjectIds: executed.effects.changedObjects
        .filter((changed) => changed.idOperation === 'Created')
        .map((changed) => changed.objectId),
      objectTypes: executed.objectTypes ?? {},
    };
  }
}

function failureOf(status: SuiClientTypes.ExecutionStatus): Error | DomainError {
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
  return new ChainExecutionFailed(
    `The chain refused the transaction: ${status.error.message}`,
    abort,
  );
}

function simulationFailureOf(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  const abort = simulatedMoveAbortOf(message);
  if (abort === null) {
    return error;
  }
  return domainErrorForAbort(abort) ?? new ChainExecutionFailed(message, abort);
}

/* The SDK reports a build time abort as prose: `MoveAbort in 1st command,
   abort code: 0, in '0x..::escrow::take' (instruction 19)`. */
export function simulatedMoveAbortOf(message: string): MoveAbortDetail | null {
  const match =
    /MoveAbort in \d+(?:st|nd|rd|th) command, abort code: (\d+), in '[^']*::(\w+)::(\w+)'/.exec(
      message,
    );
  if (match === null) {
    return null;
  }
  const [, code = '0', module = null, functionName = null] = match;
  return { module, functionName, abortCode: BigInt(code) };
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

function toChainEvent(event: SuiClientTypes.Event): ChainEvent {
  const [, name = ''] = event.eventType.split(/::(?=[^:]+$)/);
  return {
    type: event.eventType,
    module: event.module,
    name,
    json: event.json ?? {},
  };
}
