import type { Transaction } from '@mysten/sui/transactions';

/* One event as the chain reported it, with the type split so a resolver can
   match on the struct name without knowing the package id. */
export interface ChainEvent {
  readonly type: string;
  readonly module: string;
  readonly name: string;
  readonly json: Readonly<Record<string, unknown>>;
}

export interface ChainExecution {
  readonly digest: string;
  readonly events: readonly ChainEvent[];
  readonly createdObjectIds: readonly string[];
  readonly objectTypes: Readonly<Record<string, string>>;
}

/* Signs, executes, and answers the effects. The gRPC one serialises
   submissions so two units of work never race the operator's gas coin; a
   fake stands in for it in the unit of work tests. */
export interface ChainSubmitter {
  execute(transaction: Transaction): Promise<ChainExecution>;
}

export interface MoveAbortDetail {
  readonly module: string | null;
  readonly functionName: string | null;
  readonly abortCode: bigint | null;
}

/* A transaction the chain refused for a reason no domain error names. The
   database transaction rolls back on it and the api answers a fault. */
export class ChainExecutionFailed extends Error {
  constructor(
    message: string,
    readonly abort: MoveAbortDetail | null,
  ) {
    super(message);
    this.name = 'ChainExecutionFailed';
  }
}

export function eventName(event: ChainEvent): string {
  return `${event.module}::${event.name}`;
}
