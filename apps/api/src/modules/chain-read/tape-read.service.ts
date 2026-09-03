import { Inject, Injectable } from '@nestjs/common';
import type { TapeEvent } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { isoOf, objectEntry, receiptKeyOf, toMoneyDto } from './chain-read-shapes';
import type { Json } from './chain-read-shapes';
import { pledgeTermsFromJson } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(pledgeJson: Json | null): ItemCategory {
  const receipt = pledgeJson?.receipt;
  const value =
    receipt !== null && typeof receipt === 'object' ? (receipt as Json).item_category : undefined;
  return typeof value === 'number' && value >= 0 && value < categories.length
    ? (categories[value] ?? 'COLLECTIBLE')
    : 'COLLECTIBLE';
}

function readU64(value: unknown): bigint {
  return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : 0n;
}

interface Raw {
  readonly kind: TapeEvent['kind'];
  readonly pledgeId: string;
  readonly amount: bigint;
  /* The offer's own rate for an OFFER_PLACED tick; zero for a LOAN_ORIGINATED,
     which falls back to the pledge's accepted rate. */
  readonly aprBps: number;
}

/* The market ticker, built from the chain's own events: an offer placed and a
   loan originated, most recent first. The event names the pledge and the
   amount; the pledge carries the rate and the receipt whose metadata names the
   item. */
@Injectable()
export class TapeReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async read(nowMs: number, limit: number): Promise<TapeEvent[]> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const [offers, loans] = await Promise.all([
      this.client.core.listEvents({
        filter: { eventType: `${deployment.packageId}::escrow::OfferMade` },
        limit: 30,
        order: 'descending',
      }),
      this.client.core.listEvents({
        filter: { eventType: `${deployment.packageId}::pledge::LoanOriginated` },
        limit: 30,
        order: 'descending',
      }),
    ]);

    const raw: Raw[] = [];
    for (const event of offers.events) {
      const json = event.json as {
        pledge_id?: unknown;
        amount?: unknown;
        apr_bps?: unknown;
      } | null;
      if (typeof json?.pledge_id === 'string') {
        raw.push({
          kind: 'OFFER_PLACED',
          pledgeId: json.pledge_id,
          amount: readU64(json.amount),
          aprBps: Number(json.apr_bps ?? 0),
        });
      }
    }
    for (const event of loans.events) {
      const json = event.json as { pledge_id?: unknown; principal?: unknown } | null;
      if (typeof json?.pledge_id === 'string') {
        raw.push({
          kind: 'LOAN_ORIGINATED',
          pledgeId: json.pledge_id,
          amount: readU64(json.principal),
          aprBps: 0,
        });
      }
    }
    const trimmed = raw.slice(0, Math.max(0, limit));
    if (trimmed.length === 0) {
      return [];
    }

    const pledgeIds = [...new Set(trimmed.map((one) => one.pledgeId))];
    const pledges = await this.client.core.getObjects({
      objectIds: pledgeIds,
      include: { json: true },
    });
    const byPledge = new Map<
      string,
      { aprBps: number; category: ItemCategory; receiptKey: string }
    >();
    for (const object of pledges.objects) {
      const entry = objectEntry(object);
      const terms = entry === null ? null : pledgeTermsFromJson(entry.objectId, entry.json);
      if (entry !== null && terms !== null) {
        byPledge.set(entry.objectId, {
          aprBps: terms.aprBps,
          category: categoryOf(entry.json),
          receiptKey: receiptKeyOf(entry.json),
        });
      }
    }

    const events: TapeEvent[] = [];
    for (const one of trimmed) {
      const pledge = byPledge.get(one.pledgeId);
      const meta =
        pledge && pledge.receiptKey !== '' ? await this.metadata.read(pledge.receiptKey) : null;
      events.push({
        at: isoOf(nowMs),
        kind: one.kind,
        listingId: one.pledgeId,
        itemDescription: meta?.name ?? 'Vaulted item',
        itemCategory: pledge?.category ?? 'COLLECTIBLE',
        rateBasisPoints: one.aprBps > 0 ? one.aprBps : (pledge?.aprBps ?? 0),
        amount: toMoneyDto(one.amount, decimals),
      });
    }
    return events;
  }
}
