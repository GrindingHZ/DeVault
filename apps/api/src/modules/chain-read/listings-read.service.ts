import { Inject, Injectable } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { listingSeeds, openListingFromJson } from './listings-figures';
import type { OpenListing } from './listings-figures';
import { DeploymentNotFound } from './wallet-read.service';

/* A standing offer on a pledge, from its OfferMade event: the hold that backs
   it, the amount it holds, and the lender who made it. */
export interface PledgeOffer {
  readonly holdObjectId: string;
  readonly amountBaseUnits: bigint;
  readonly aprBps: number;
  readonly lender: string;
}

/* Reads the open listings from the chain over gRPC: the pledges a borrower has
   opened and not yet had funded or cancelled, for a lender to browse. The
   pledge ids come from ListingOpened events because shared objects cannot be
   listed by type, and each is read back so a pledge an offer already took drops
   out. The client only reads, so this needs no operator key. */
@Injectable()
export class ListingsReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
  ) {}

  async read(): Promise<{
    readonly decimals: number;
    readonly listings: readonly OpenListing[];
    readonly offerCountByPledge: ReadonlyMap<string, number>;
    readonly offersByPledge: ReadonlyMap<string, readonly PledgeOffer[]>;
  }> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const [events, offerEvents] = await Promise.all([
      this.client.core.listEvents({
        filter: { eventType: `${deployment.packageId}::pledge::ListingOpened` },
        limit: 200,
        order: 'descending',
      }),
      this.client.core.listEvents({
        filter: { eventType: `${deployment.packageId}::escrow::OfferMade` },
        limit: 500,
        order: 'descending',
      }),
    ]);
    /* How many offers each pledge has drawn and their standing amounts, so a
       listing can say a lender is competing and its detail can show the book the
       borrower accepts from. */
    const offerCountByPledge = new Map<string, number>();
    const offersByPledge = new Map<string, PledgeOffer[]>();
    for (const event of offerEvents.events) {
      const json = event.json as {
        pledge_id?: unknown;
        hold_id?: unknown;
        amount?: unknown;
        apr_bps?: unknown;
        owner?: unknown;
      } | null;
      const pledgeId = json?.pledge_id;
      const holdId = json?.hold_id;
      if (typeof pledgeId !== 'string' || typeof holdId !== 'string') {
        continue;
      }
      offerCountByPledge.set(pledgeId, (offerCountByPledge.get(pledgeId) ?? 0) + 1);
      const amount =
        typeof json?.amount === 'string' && /^\d+$/.test(json.amount) ? BigInt(json.amount) : 0n;
      const aprBps = Number(json?.apr_bps ?? 0);
      const lender = typeof json?.owner === 'string' ? json.owner : event.sender;
      const list = offersByPledge.get(pledgeId) ?? [];
      list.push({ holdObjectId: holdId, amountBaseUnits: amount, aprBps, lender });
      offersByPledge.set(pledgeId, list);
    }
    const seeds = listingSeeds(events.events.map((event) => ({ json: event.json })));
    if (seeds.length === 0) {
      return { decimals, listings: [], offerCountByPledge, offersByPledge };
    }
    const receiptKeys = new Map(seeds.map((seed) => [seed.pledgeId, seed.receiptKey]));
    const objects = await this.client.core.getObjects({
      objectIds: seeds.map((seed) => seed.pledgeId),
      include: { json: true },
    });
    const listings: OpenListing[] = [];
    for (const object of objects.objects) {
      const record = object as { objectId?: unknown; json?: unknown; code?: unknown };
      if (typeof record.objectId !== 'string' || record.code !== undefined) {
        continue;
      }
      const json =
        record.json === null || record.json === undefined
          ? null
          : (record.json as Record<string, unknown>);
      const listing = openListingFromJson(
        record.objectId,
        receiptKeys.get(record.objectId) ?? '',
        json,
      );
      if (listing !== null) {
        listings.push(listing);
      }
    }
    return { decimals, listings, offerCountByPledge, offersByPledge };
  }
}
