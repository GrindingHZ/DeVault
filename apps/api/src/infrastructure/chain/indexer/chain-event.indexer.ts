import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { PrismaService } from '../../persistence/prisma.service';
import type { ChainClient } from '../chain-client';
import { ChainDeploymentRegistry } from '../chain-deployment.registry';
import { boundedChainRead } from '../chain-reads';
import { CHAIN_CLIENT } from '../chain.tokens';

/* The modules whose events are the chain's account of the book. */
export const indexedModules = ['config', 'custody', 'escrow', 'attestation'] as const;

export type IndexedModule = (typeof indexedModules)[number];

interface CollectedEvent {
  readonly id: string;
  readonly checkpoint: bigint | null;
  readonly digest: string;
  readonly eventIndex: number;
  readonly eventType: string;
  readonly sender: string;
  readonly json: Prisma.InputJsonValue;
}

const pageSize = 50;
const pagesPerDrain = 40;

/* Follows the package's events on the full node with a durable cursor per
   module: the newest event already stored. Each drain reads newest first
   down to that event, inserts the page and moves the cursor in one database
   transaction, and the primary key makes a page processed twice insert
   nothing twice. Reading down from the newest rather than up from a cursor
   is deliberate: the node prunes its oldest ledger data and refuses a read
   from before what it still holds (docs/08-web3-migration.md, the indexer). */
@Injectable()
export class ChainEventIndexer implements OnModuleDestroy {
  private readonly logger = new Logger(ChainEventIndexer.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    private readonly deployments: ChainDeploymentRegistry,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  start(intervalMs: number): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.drainOnce().catch((error: unknown) => {
        this.logger.error(`the chain indexer failed: ${String(error)}`);
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  async drainOnce(): Promise<number> {
    let inserted = 0;
    for (const module of indexedModules) {
      inserted += await this.drainModule(module);
    }
    return inserted;
  }

  /* Forgets every cursor and drains again. The primary key keeps the rows
     that were already there, so the count answered is what was missing. */
  async replayFromStart(): Promise<number> {
    await this.prisma.chainIndexerCursor.deleteMany({});
    return this.drainOnce();
  }

  private async drainModule(module: IndexedModule): Promise<number> {
    const packageId = this.deployments.current().packageId;
    const cursor = await this.prisma.chainIndexerCursor.findUnique({ where: { module } });
    const known = cursor?.newestEventId ?? null;
    const collected: CollectedEvent[] = [];
    let before: string | null = null;
    let reachedKnown = false;
    for (let page = 0; page < pagesPerDrain && !reachedKnown; page += 1) {
      const response = await boundedChainRead(`events of ${module}`, (signal) =>
        this.client.listEvents({
          filter: { emitModule: `${packageId}::${module}` },
          order: 'descending',
          before,
          limit: pageSize,
          signal,
        }),
      );
      for (const entry of response.events) {
        const id = `${entry.transactionDigest}:${entry.eventIndex}`;
        if (id === known) {
          reachedKnown = true;
          break;
        }
        collected.push({
          id,
          checkpoint: entry.checkpoint === null ? null : BigInt(entry.checkpoint),
          digest: entry.transactionDigest,
          eventIndex: entry.eventIndex,
          eventType: entry.eventType,
          sender: entry.sender,
          json: (entry.json ?? {}) as Prisma.InputJsonValue,
        });
      }
      if (!response.hasNextPage) {
        break;
      }
      before = response.endCursor;
    }
    if (collected.length === 0) {
      return 0;
    }
    const newest = collected[0]?.id ?? known;
    const ingestedAt = new Date(Number(this.clock.now().epochMilliseconds));
    return this.prisma.$transaction(async (transaction) => {
      const written = await transaction.chainEvent.createMany({
        data: collected.map((event) => ({ ...event, module, ingestedAt })),
        skipDuplicates: true,
      });
      await transaction.chainIndexerCursor.upsert({
        where: { module },
        update: { newestEventId: newest },
        create: { module, newestEventId: newest },
      });
      return written.count;
    });
  }
}
