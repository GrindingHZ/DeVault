import { Inject, Injectable } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import {
  borrowerStanding,
  holdExpiresAtFromJson,
  itemFromJson,
  lenderStanding,
  notePledgeIdFromJson,
  offerFromEventJson,
  offerStanding,
  pledgeTermsFromJson,
  summarizeFigures,
} from './wallet-figures';
import type {
  OfferEvent,
  PledgeTerms,
  WalletFigures,
  WalletItem,
} from './wallet-figures';

export interface WalletReadResult {
  readonly decimals: number;
  readonly figures: WalletFigures;
  readonly items: readonly WalletItem[];
}

export class DeploymentNotFound extends Error {
  constructor() {
    super('No deployment has been published');
    this.name = 'DeploymentNotFound';
  }
}

/* A gRPC object entry, whether from listOwnedObjects (always an object) or
   getObjects (an object or an error for a deleted id). Anything without a
   string id is a missing object and is skipped. */
function objectEntry(entry: unknown): { objectId: string; json: Record<string, unknown> | null } | null {
  if (entry !== null && typeof entry === 'object' && !(entry instanceof Error)) {
    const record = entry as { objectId?: unknown; json?: unknown };
    if (typeof record.objectId === 'string') {
      const json = record.json;
      return { objectId: record.objectId, json: json === null || json === undefined ? null : (json as Record<string, unknown>) };
    }
  }
  return null;
}

function isString(value: string | null): value is string {
  return value !== null;
}

/* Reads a member's whole money position from a full node over gRPC and derives
   the figures. The client only reads, so this needs no operator key and works
   whether or not the settlement driver is on. */
@Injectable()
export class WalletReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
  ) {}

  async read(owner: string, nowMs: number): Promise<WalletReadResult> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const packageId = deployment.packageId;

    const [balance, lenderNotes, borrowerNotes, receiptObjects, events] = await Promise.all([
      this.client.core.getBalance({ owner, coinType: deployment.settlementCoinType }),
      this.client.core.listOwnedObjects({ owner, type: `${packageId}::notes::LenderNote`, include: { json: true } }),
      this.client.core.listOwnedObjects({ owner, type: `${packageId}::notes::BorrowerNote`, include: { json: true } }),
      this.client.core.listOwnedObjects({ owner, type: `${packageId}::custody::VaultReceipt`, include: { json: true } }),
      this.client.core.listEvents({ filter: { sender: owner }, limit: 50, order: 'descending' }),
    ]);

    const availableBaseUnits = BigInt(balance.balance.balance);
    const lenderPledgeIds = lenderNotes.objects
      .map((object) => notePledgeIdFromJson(objectEntry(object)?.json ?? null))
      .filter(isString);
    const borrowerPledgeIds = borrowerNotes.objects
      .map((object) => notePledgeIdFromJson(objectEntry(object)?.json ?? null))
      .filter(isString);
    const offerEvents = events.events
      .filter((event) => event.eventType === `${packageId}::escrow::OfferMade`)
      .map((event) => offerFromEventJson(event.json))
      .filter((offer): offer is OfferEvent => offer !== null);

    const pledgeIds = [
      ...new Set([...lenderPledgeIds, ...borrowerPledgeIds, ...offerEvents.map((offer) => offer.pledgeId)]),
    ];
    const termsById = await this.pledgeTerms(pledgeIds);
    const liveHolds = await this.liveHolds(offerEvents.map((offer) => offer.holdObjectId));

    const lender = lenderPledgeIds
      .map((id) => termsById.get(id))
      .filter((terms): terms is PledgeTerms => terms !== undefined)
      .map((terms) => lenderStanding(terms, nowMs));
    const borrower = borrowerPledgeIds
      .map((id) => termsById.get(id))
      .filter((terms): terms is PledgeTerms => terms !== undefined)
      .map((terms) => borrowerStanding(terms, nowMs));
    const offers = offerEvents.map((offer) =>
      offerStanding(
        {
          holdObjectId: offer.holdObjectId,
          pledgeId: offer.pledgeId,
          amountBaseUnits: offer.amountBaseUnits,
          exists: liveHolds.has(offer.holdObjectId),
          pledgeStatus: termsById.get(offer.pledgeId)?.status ?? null,
          expiresAtMs: liveHolds.get(offer.holdObjectId) ?? 0,
        },
        nowMs,
      ),
    );
    const items = receiptObjects.objects
      .map((object) => {
        const entry = objectEntry(object);
        return entry === null ? null : itemFromJson(entry.objectId, entry.json);
      })
      .filter((item): item is WalletItem => item !== null);

    return {
      decimals: deployment.settlementCoinDecimals,
      figures: summarizeFigures({ availableBaseUnits, lender, borrower, offers }),
      items,
    };
  }

  private async pledgeTerms(pledgeIds: readonly string[]): Promise<Map<string, PledgeTerms>> {
    const terms = new Map<string, PledgeTerms>();
    if (pledgeIds.length === 0) {
      return terms;
    }
    const result = await this.client.core.getObjects({ objectIds: [...pledgeIds], include: { json: true } });
    for (const object of result.objects) {
      const entry = objectEntry(object);
      const parsed = entry === null ? null : pledgeTermsFromJson(entry.objectId, entry.json);
      if (parsed !== null) {
        terms.set(parsed.pledgeId, parsed);
      }
    }
    return terms;
  }

  /* Which holds still exist, keyed to their expiry. A hold the accept deleted or
     a refund pulled is absent, which the derivation reads as consumed. */
  private async liveHolds(holdIds: readonly string[]): Promise<Map<string, number>> {
    const holds = new Map<string, number>();
    if (holdIds.length === 0) {
      return holds;
    }
    const result = await this.client.core.getObjects({ objectIds: [...holdIds], include: { json: true } });
    for (const object of result.objects) {
      const entry = objectEntry(object);
      if (entry !== null) {
        holds.set(entry.objectId, holdExpiresAtFromJson(entry.json));
      }
    }
    return holds;
  }
}
