import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from '@mysten/sui/transactions';
import type { Prisma } from '@prisma/client';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { UnitOfWork, UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import type { Instant } from '../../domain/shared/instant';
import { PrismaService } from '../persistence/prisma.service';
import { PrismaUnitOfWorkContext } from '../persistence/prisma-unit-of-work';
import { ChainSettlementRef, pendingReferencePrefix } from './chain-settlement-ref';
import type { ChainExecution, ChainSubmitter } from './chain-execution';
import { CHAIN_SUBMITTER } from './chain.tokens';
import { patchPendingReferences } from './pending-reference-patches';

type Resolver = (execution: ChainExecution) => Promise<void>;

/* The Prisma context with a transaction builder beside it. The Prisma
   adapters keep working through it because it is still the Prisma context;
   the chain adapters append commands and register what to do once the
   digest is known. */
export class SuiUnitOfWorkContext extends PrismaUnitOfWorkContext {
  override readonly driver = 'sui';
  readonly chainTransaction = new Transaction();
  private readonly settlementRefs: ChainSettlementRef[] = [];
  private readonly resolvers: Resolver[] = [];

  constructor(
    transaction: Prisma.TransactionClient,
    readonly startedAt: Instant,
    private readonly token: string,
  ) {
    super(transaction);
  }

  hasChainCommands(): boolean {
    return this.chainTransaction.getData().commands.length > 0;
  }

  issueSettlementRef(): ChainSettlementRef {
    const ref = new ChainSettlementRef(
      `${pendingReferencePrefix}${this.token}:${this.settlementRefs.length + 1}`,
      this.startedAt,
    );
    this.settlementRefs.push(ref);
    return ref;
  }

  onResolved(resolver: Resolver): void {
    this.resolvers.push(resolver);
  }

  async resolve(execution: ChainExecution): Promise<void> {
    const since = new Date(Number(this.startedAt.epochMilliseconds));
    for (const ref of this.settlementRefs) {
      ref.resolve(execution.digest);
      await patchPendingReferences(this.transaction, ref.token, execution.digest, since);
    }
    for (const resolver of this.resolvers) {
      await resolver(execution);
    }
  }
}

export function chainContextOf(context: UnitOfWorkContext): SuiUnitOfWorkContext {
  if (!(context instanceof SuiUnitOfWorkContext)) {
    throw new Error('The unit of work context does not carry a chain transaction');
  }
  return context;
}

/* A rejected Result is a use case saying no before any money moved, so the
   commands it appended on the way must not be sent. */
function isRejectedResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

/* One use case, one database transaction, one programmable transaction: the
   block is signed and executed before the database commits, so a chain
   failure rolls the rows back and a database failure after a successful
   execution is the dual write gap the indexer and reconciliation exist to
   catch. */
@Injectable()
export class SuiUnitOfWork implements UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAIN_SUBMITTER) private readonly submitter: ChainSubmitter,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (transaction) => {
        const context = new SuiUnitOfWorkContext(
          transaction,
          this.clock.now(),
          this.idGenerator.generate(),
        );
        const result = await work(context);
        if (context.hasChainCommands() && !isRejectedResult(result)) {
          const execution = await this.submitter.execute(context.chainTransaction);
          await context.resolve(execution);
        }
        return result;
      },
      // A chain execution waits for consensus; the default five seconds is
      // for a database round trip.
      { timeout: 120_000, maxWait: 15_000 },
    );
  }
}
