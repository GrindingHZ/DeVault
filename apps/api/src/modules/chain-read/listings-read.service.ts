import { Inject, Injectable } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { listingPledgeIds, openListingFromJson } from './listings-figures';
import type { OpenListing } from './listings-figures';
import { DeploymentNotFound } from './wallet-read.service';

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

  async read(): Promise<{ readonly decimals: number; readonly listings: readonly OpenListing[] }> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const events = await this.client.core.listEvents({
      filter: { eventType: `${deployment.packageId}::pledge::ListingOpened` },
      limit: 200,
      order: 'descending',
    });
    const pledgeIds = listingPledgeIds(events.events.map((event) => ({ json: event.json })));
    if (pledgeIds.length === 0) {
      return { decimals, listings: [] };
    }
    const objects = await this.client.core.getObjects({ objectIds: pledgeIds, include: { json: true } });
    const listings: OpenListing[] = [];
    for (const object of objects.objects) {
      const record = object as { objectId?: unknown; json?: unknown; code?: unknown };
      if (typeof record.objectId !== 'string' || record.code !== undefined) {
        continue;
      }
      const json = record.json === null || record.json === undefined ? null : (record.json as Record<string, unknown>);
      const listing = openListingFromJson(record.objectId, json);
      if (listing !== null) {
        listings.push(listing);
      }
    }
    return { decimals, listings };
  }
}
