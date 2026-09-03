import { Inject, Injectable } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { redemptionEventsToQueue } from './release-figures';
import type { ReleaseQueueItem } from './release-figures';
import { DeploymentNotFound } from './wallet-read.service';

/* Reads the release queue from the chain over gRPC: every RedemptionRequested
   event the custody module has emitted, most recent first. The client only
   reads, so this needs no operator key. Staff match a row to their intake
   record, check identity in person, and hand the item over; there is nothing to
   write back, because the burn already settled the claim. */
@Injectable()
export class ReleaseReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
  ) {}

  async read(): Promise<readonly ReleaseQueueItem[]> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const events = await this.client.core.listEvents({
      filter: { eventType: `${deployment.packageId}::custody::RedemptionRequested` },
      limit: 100,
      order: 'descending',
    });
    return redemptionEventsToQueue(
      events.events.map((event) => ({
        transactionDigest: event.transactionDigest,
        sender: event.sender,
        json: event.json,
      })),
    );
  }
}
