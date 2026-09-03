import type { ChainClient } from '../../src/infrastructure/chain/chain-client';
import { boundedChainRead } from '../../src/infrastructure/chain/chain-reads';
import { textOfBytesField } from '../../src/infrastructure/chain/ptb/codec';

/* Reads the chain the way a person would with an explorer: an object by id,
   and the events a module emitted since a cursor. The lifecycle test asserts
   through it after every api call, which is how the suite sees what the
   node saw rather than what the database says. */
export interface ChainObjectSnapshot {
  readonly objectId: string;
  readonly ownerKind: string;
  readonly json: Readonly<Record<string, unknown>>;
}

export interface ChainEventSnapshot {
  readonly name: string;
  readonly digest: string;
  readonly json: Readonly<Record<string, unknown>>;
}

interface CollectedEvent extends ChainEventSnapshot {
  readonly identity: string;
}

export class ChainInspector {
  private readonly newest = new Map<string, string | null>();
  private readonly previousNewest = new Map<string, string | null>();

  constructor(
    private readonly client: ChainClient,
    private readonly packageId: string,
  ) {}

  async object(objectId: string): Promise<ChainObjectSnapshot> {
    const { object } = await boundedChainRead(`object ${objectId}`, (signal) =>
      this.client.core.getObject({ objectId, include: { json: true }, signal }),
    );
    return { objectId, ownerKind: object.owner.$kind, json: object.json ?? {} };
  }

  async exists(objectId: string): Promise<boolean> {
    try {
      await this.object(objectId);
      return true;
    } catch {
      return false;
    }
  }

  /* The events of one module since the last call for that module, oldest
     first. Read newest first down to the last event seen, because the node
     prunes its oldest ledger data and a read from the beginning of time is
     refused; the first call only marks where the module currently ends. */
  async newEvents(module: string, atLeast = 1): Promise<ChainEventSnapshot[]> {
    const started = Date.now();
    for (;;) {
      const events = await this.readNewEvents(module);
      if (events.length >= atLeast || Date.now() - started > 30_000) {
        return events;
      }
      this.rewind(module, events);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /* Waits until the node's event index has caught up with a transaction the
     test already holds the digest of, so a following read cannot mistake a
     straggler for the next step's work. */
  async syncDigest(module: string, digest: string): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 30_000) {
      const events = await this.readNewEvents(module);
      if (events.some((event) => event.digest === digest)) {
        return;
      }
      this.rewind(module, events);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`The event index never showed ${digest} for ${module}`);
  }

  private rewind(module: string, events: readonly ChainEventSnapshot[]): void {
    if (events.length > 0) {
      this.newest.set(module, this.previousNewest.get(module) ?? null);
    }
  }

  /* New events are the newest, so a descending read from the tip finds them
     on the first pages. Paging stops at the last event seen, and a read that
     falls into data the node has pruned is the end of what it holds rather
     than an error. */
  private async readNewEvents(module: string): Promise<ChainEventSnapshot[]> {
    const known = this.newest.get(module) ?? null;
    this.previousNewest.set(module, known);
    const collected: CollectedEvent[] = [];
    let before: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      let response;
      try {
        response = await boundedChainRead(`events of ${module}`, (signal) =>
          this.client.listEvents({
            filter: { emitModule: `${this.packageId}::${module}` },
            order: 'descending',
            before,
            limit: 50,
            signal,
          }),
        );
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          /below earliest available|pruned|missing tx_seq/.test(error.message)
        ) {
          break;
        }
        throw error;
      }
      let reachedKnown = false;
      for (const entry of response.events) {
        const identity = `${entry.transactionDigest}:${entry.eventIndex}`;
        if (identity === known) {
          reachedKnown = true;
          break;
        }
        const [, name = ''] = entry.eventType.split(/::(?=[^:]+$)/);
        collected.push({ name, digest: entry.transactionDigest, json: entry.json ?? {}, identity });
      }
      if (reachedKnown || !response.hasNextPage) {
        break;
      }
      before = response.endCursor;
    }
    const newest = collected[0]?.identity ?? known;
    this.newest.set(module, newest);
    return collected.reverse().map(({ name, digest, json }) => ({ name, digest, json }));
  }

  async attestations(
    atLeast = 1,
  ): Promise<{ eventType: string; subjectId: string; payload: string }[]> {
    const events = await this.newEvents('attestation', atLeast);
    return events.map((event) => ({
      eventType: textOfBytesField(event.json.event_type),
      subjectId: textOfBytesField(event.json.subject_id),
      payload: textOfBytesField(event.json.payload),
    }));
  }
}
