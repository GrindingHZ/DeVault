import { Inject, Injectable } from '@nestjs/common';
import type { NoteSaleSummary } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { isoOf, objectEntry, receiptKeyOf, toMoneyDto } from './chain-read-shapes';
import type { Json } from './chain-read-shapes';
import { accruedBaseUnits, pledgeTermsFromJson } from './wallet-figures';
import type { PledgeTerms } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(json: Json | null): ItemCategory {
  const receipt = json?.receipt;
  const value = receipt !== null && typeof receipt === 'object' ? (receipt as Json).item_category : undefined;
  const names: readonly string[] = categories;
  if (typeof value === 'number' && value >= 0 && value < names.length) {
    return categories[value] ?? 'COLLECTIBLE';
  }
  return 'COLLECTIBLE';
}

function readU64(value: unknown): bigint {
  return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : 0n;
}

interface Listing {
  readonly listingId: string;
  readonly seller: string;
  readonly ask: bigint;
  readonly pledgeId: string;
  readonly lenderNoteId: string;
}

/* The secondary market, read from the chain: PositionListing objects a lender
   opened to sell a note. The ids come from PositionListed events, and each is
   read back so a sold or delisted one drops out. The wrapped note names the
   pledge whose terms price the sale. */
@Injectable()
export class NoteSalesReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async read(nowMs: number): Promise<{ decimals: number; items: NoteSaleSummary[] }> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const events = await this.client.core.listEvents({
      filter: { eventType: `${deployment.packageId}::market::PositionListed` },
      limit: 200,
      order: 'descending',
    });
    const listingIds: string[] = [];
    const seen = new Set<string>();
    for (const event of events.events) {
      const id = (event.json as { listing_id?: unknown } | null)?.listing_id;
      if (typeof id === 'string' && !seen.has(id)) {
        seen.add(id);
        listingIds.push(id);
      }
    }
    if (listingIds.length === 0) {
      return { decimals, items: [] };
    }

    const listingObjects = await this.client.core.getObjects({ objectIds: listingIds, include: { json: true } });
    const listings: Listing[] = [];
    for (const object of listingObjects.objects) {
      const entry = objectEntry(object);
      if (entry === null || entry.json === null) {
        continue;
      }
      const note = entry.json.note;
      const noteJson = note !== null && typeof note === 'object' ? (note as Json) : null;
      const pledgeId = noteJson?.pledge_id;
      const seller = entry.json.seller;
      if (typeof pledgeId !== 'string' || typeof seller !== 'string') {
        continue;
      }
      listings.push({
        listingId: entry.objectId,
        seller,
        ask: readU64(entry.json.ask),
        pledgeId,
        lenderNoteId: typeof noteJson?.lender_note_id === 'string' ? noteJson.lender_note_id : '',
      });
    }
    if (listings.length === 0) {
      return { decimals, items: [] };
    }

    const pledgeIds = [...new Set(listings.map((one) => one.pledgeId))];
    const pledges = await this.client.core.getObjects({ objectIds: pledgeIds, include: { json: true } });
    const termsById = new Map<string, { terms: PledgeTerms; receiptKey: string; category: ItemCategory }>();
    for (const object of pledges.objects) {
      const entry = objectEntry(object);
      const terms = entry === null ? null : pledgeTermsFromJson(entry.objectId, entry.json);
      if (entry !== null && terms !== null) {
        termsById.set(entry.objectId, {
          terms,
          receiptKey: receiptKeyOf(entry.json),
          category: categoryOf(entry.json),
        });
      }
    }

    const items: NoteSaleSummary[] = [];
    for (const listing of listings) {
      const pledge = termsById.get(listing.pledgeId);
      if (pledge === undefined) {
        continue;
      }
      const meta = pledge.receiptKey === '' ? null : await this.metadata.read(pledge.receiptKey);
      const accrued = accruedBaseUnits(pledge.terms, nowMs);
      const wholeTerm = accruedBaseUnits(pledge.terms, pledge.terms.maturesAtMs);
      items.push({
        id: listing.listingId,
        loanId: listing.pledgeId,
        lenderNoteId: listing.lenderNoteId,
        sellerAccountId: listing.seller,
        status: 'OPEN',
        askPrice: toMoneyDto(listing.ask, decimals),
        createdAt: isoOf(nowMs),
        receiptId: pledge.receiptKey === '' ? listing.pledgeId : pledge.receiptKey,
        itemDescription: meta?.name ?? 'Vaulted item',
        itemCategory: pledge.category,
        hasPhotograph: meta !== null,
        principal: toMoneyDto(pledge.terms.principalBaseUnits, decimals),
        annualPercentageRateBasisPoints: pledge.terms.aprBps,
        startedAt: isoOf(pledge.terms.startedAtMs),
        maturesAt: isoOf(pledge.terms.maturesAtMs),
        accruedInterest: toMoneyDto(accrued, decimals),
        currentValue: toMoneyDto(pledge.terms.principalBaseUnits + accrued, decimals),
        maturityValue: toMoneyDto(pledge.terms.principalBaseUnits + wholeTerm, decimals),
      });
    }
    return { decimals, items };
  }
}
