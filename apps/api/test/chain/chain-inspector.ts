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

export class ChainInspector {
  private readonly newest = new Map<string, string | null>();

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
  async newEvents(module: string): Promise<ChainEventSnapshot[]> {
    const known = this.newest.get(module);
    const collected: (ChainEventSnapshot & { readonly identity: string })[] = [];
    let before: string | null = null;
    let reachedKnown = false;
    for (let page = 0; page < 10 && !reachedKnown; page += 1) {
      const response = await boundedChainRead(`events of ${module}`, (signal) =>
        this.client.listEvents({
          filter: { emitModule: `${this.packageId}::${module}` },
          order: 'descending',
          before,
          limit: 50,
          signal,
        }),
      );
      for (const entry of response.events) {
        const identity = `${entry.transactionDigest}:${entry.eventIndex}`;
        if (identity === known) {
          reachedKnown = true;
          break;
        }
        const [, name = ''] = entry.eventType.split(/::(?=[^:]+$)/);
        collected.push({ identity, name, digest: entry.transactionDigest, json: entry.json ?? {} });
      }
      if (!response.hasNextPage) {
        break;
      }
      before = response.endCursor;
    }
    const newest = collected[0]?.identity ?? known ?? null;
    this.newest.set(module, newest);
    if (known === undefined) {
      return [];
    }
    return collected.reverse().map(({ name, digest, json }) => ({ name, digest, json }));
  }

  async attestations(): Promise<{ eventType: string; subjectId: string; payload: string }[]> {
    const events = await this.newEvents('attestation');
    return events.map((event) => ({
      eventType: textOfBytesField(event.json.event_type),
      subjectId: textOfBytesField(event.json.subject_id),
      payload: textOfBytesField(event.json.payload),
    }));
  }
}
