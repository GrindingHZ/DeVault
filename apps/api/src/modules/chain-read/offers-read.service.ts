import { Inject, Injectable } from '@nestjs/common';
import type { MyOfferResponse } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import {
  holdExpiresAtFromJson,
  holdStatusOf,
  notePledgeIdFromJson,
  offerFromEventJson,
  pledgeTermsFromJson,
} from './wallet-figures';
import type { HoldStatus, OfferEvent, PledgeStatus, PledgeTerms } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';
import { objectEntry, receiptKeyOf, toMoneyDto } from './chain-read-shapes';

export interface MyOffersResult {
  readonly items: readonly MyOfferResponse[];
  readonly asOfMs: number;
}

/* The offer state machine (docs/14): a standing hold is PENDING; a hold the
   member now lends against (they hold the note) was ACCEPTED; otherwise the
   money lost, and which word it gets is the listing's fate versus its own. An
   offer beaten while its pledge was funded is SUPERSEDED; one whose pledge is
   still open ran out on its own date, which is EXPIRED. A deliberate withdraw
   is indistinguishable on chain from an expiry followed by a reclaim, both being
   a refund of the same hold, so it folds into EXPIRED. */
function offerStatusOf(
  hold: HoldStatus,
  pledgeStatus: PledgeStatus | null,
  wasAccepted: boolean,
): MyOfferResponse['status'] {
  if (hold === 'committed') {
    return 'PENDING';
  }
  if (wasAccepted) {
    return 'ACCEPTED';
  }
  const pledgeWasFunded = pledgeStatus !== null && pledgeStatus !== 'open';
  return pledgeWasFunded ? 'SUPERSEDED' : 'EXPIRED';
}

/* The member's offers, read from the chain into the shape the portfolio and the
   workspace speak. An OfferMade event the member sent names the hold that backs
   it and the pledge it stands against; the hold says whether the money is still
   committed, and the pledge carries the rate the borrower asked and the receipt
   whose key finds the item. An offer whose pledge the member now lends against
   was accepted; one whose hold is gone otherwise was refunded. */
@Injectable()
export class OffersReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async read(owner: string, nowMs: number): Promise<MyOffersResult> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const packageId = deployment.packageId;
    const decimals = deployment.settlementCoinDecimals;

    const [events, lenderNotes] = await Promise.all([
      this.client.core.listEvents({ filter: { sender: owner }, limit: 50, order: 'descending' }),
      this.client.core.listOwnedObjects({
        owner,
        type: `${packageId}::notes::LenderNote`,
        include: { json: true },
      }),
    ]);
    const offers = events.events
      .filter((event) => event.eventType === `${packageId}::escrow::OfferMade`)
      .map((event) => offerFromEventJson(event.json))
      .filter((offer): offer is OfferEvent => offer !== null);
    if (offers.length === 0) {
      return { items: [], asOfMs: nowMs };
    }
    const fundedPledgeIds = new Set(
      lenderNotes.objects
        .map((object) => notePledgeIdFromJson(objectEntry(object)?.json ?? null))
        .filter((id): id is string => id !== null),
    );

    const holdIds = offers.map((offer) => offer.holdObjectId);
    const pledgeIds = [...new Set(offers.map((offer) => offer.pledgeId))];
    const [holds, pledges] = await Promise.all([
      this.client.core.getObjects({ objectIds: holdIds, include: { json: true } }),
      this.client.core.getObjects({ objectIds: pledgeIds, include: { json: true } }),
    ]);
    const holdById = new Map<string, number>();
    for (const object of holds.objects) {
      const entry = objectEntry(object);
      if (entry !== null) {
        holdById.set(entry.objectId, holdExpiresAtFromJson(entry.json));
      }
    }
    const pledgeById = new Map<string, { terms: PledgeTerms | null; receiptKey: string }>();
    for (const object of pledges.objects) {
      const entry = objectEntry(object);
      if (entry !== null) {
        pledgeById.set(entry.objectId, {
          terms: pledgeTermsFromJson(entry.objectId, entry.json),
          receiptKey: receiptKeyOf(entry.json),
        });
      }
    }

    const items: MyOfferResponse[] = [];
    for (const offer of offers) {
      const pledge = pledgeById.get(offer.pledgeId);
      const expiresAtMs = holdById.get(offer.holdObjectId);
      const exists = expiresAtMs !== undefined;
      const status = holdStatusOf(
        {
          exists,
          pledgeStatus: pledge?.terms?.status ?? null,
          expiresAtMs: expiresAtMs ?? 0,
        },
        nowMs,
      );
      const receiptKey = pledge?.receiptKey ?? '';
      const meta = receiptKey === '' ? null : await this.metadata.read(receiptKey);
      items.push({
        id: offer.holdObjectId,
        listingId: offer.pledgeId,
        lenderAccountId: owner,
        principal: toMoneyDto(offer.amountBaseUnits, decimals),
        annualPercentageRateBasisPoints: pledge?.terms?.aprBps ?? 0,
        durationMs: 0,
        expiresAt: new Date(expiresAtMs ?? nowMs).toISOString(),
        createdAt: new Date(nowMs).toISOString(),
        status: offerStatusOf(status, pledge?.terms?.status ?? null, fundedPledgeIds.has(offer.pledgeId)),
        itemDescription: meta?.name ?? 'Vaulted item',
        receiptId: receiptKey === '' ? offer.pledgeId : receiptKey,
        hasPhotograph: meta !== null,
        isHoldHeld: status === 'committed' || status === 'reclaimable',
      });
    }
    return { items, asOfMs: nowMs };
  }
}
