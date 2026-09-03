import { Injectable } from '@nestjs/common';
import type {
  ListingDetailResponse,
  ListingSummary,
  MyListingResponse,
  RankedOfferResponse,
} from '@depawn/contracts';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { ListingsReadService } from './listings-read.service';
import type { OpenListing } from './listings-figures';
import { toMoneyDto } from './chain-read-shapes';

/* Self-custody has no requested principal, term, or expiry on an open listing:
   a borrower opens a pledge at a rate and lenders compete on amount. The web2
   listing dtos carry all three, so they are filled with sensible stand-ins the
   ui can render: the appraisal is the ceiling a lender could lend to, the term
   is the platform default, and an open pledge does not lapse. */
const DEFAULT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
const CATEGORY_MAX_LOAN_TO_VALUE_BPS = 7_500;

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(value: string): ItemCategory {
  return (categories as readonly string[]).includes(value) ? (value as ItemCategory) : 'COLLECTIBLE';
}

/* The name and whether a photograph exists, read from the metadata store by the
   receipt key the listing carries. */
export interface ListingItem {
  readonly itemDescription: string;
  readonly hasPhotograph: boolean;
}

@Injectable()
export class MarketReadService {
  constructor(
    private readonly listings: ListingsReadService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async browse(viewerAddress: string, nowMs: number): Promise<{ items: ListingSummary[] }> {
    const { decimals, listings, offerCountByPledge } = await this.listings.read();
    const items: ListingSummary[] = [];
    for (const listing of listings) {
      if (listing.borrower === viewerAddress) {
        continue;
      }
      items.push(await this.toSummary(listing, decimals, offerCountByPledge, nowMs));
    }
    return { items };
  }

  async mine(viewerAddress: string, nowMs: number): Promise<{ items: MyListingResponse[] }> {
    const { decimals, listings, offerCountByPledge } = await this.listings.read();
    const items: MyListingResponse[] = [];
    for (const listing of listings) {
      if (listing.borrower !== viewerAddress) {
        continue;
      }
      const item = await this.itemOf(listing);
      items.push({
        id: listing.pledgeId,
        borrowerAccountId: listing.borrower,
        receiptId: listing.receiptKey === '' ? listing.pledgeId : listing.receiptKey,
        requestedPrincipal: toMoneyDto(listing.appraisedValueBaseUnits, decimals),
        maxAnnualPercentageRateBasisPoints: listing.requestedAprBps,
        requestedDurationMs: DEFAULT_DURATION_MS,
        expiresAt: new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString(),
        status: 'ACTIVE',
        itemDescription: item.itemDescription,
        itemCategory: categoryOf(listing.itemCategory),
        hasPhotograph: item.hasPhotograph,
        bestOfferRateBasisPoints: null,
        offerCount: offerCountByPledge.get(listing.pledgeId) ?? 0,
      });
    }
    return { items };
  }

  async detail(pledgeId: string, nowMs: number): Promise<ListingDetailResponse | null> {
    const { decimals, listings, offerCountByPledge, offersByPledge } = await this.listings.read();
    const listing = listings.find((one) => one.pledgeId === pledgeId);
    if (listing === undefined) {
      return null;
    }
    const summary = await this.toSummary(listing, decimals, offerCountByPledge, nowMs);
    const offers = offersByPledge.get(pledgeId) ?? [];
    const offerBook = offers.map((offer): RankedOfferResponse => {
      const principal = toMoneyDto(offer.amountBaseUnits, decimals);
      /* The whole-term cost, so the borrower can rank offers of the same rate by
         the money they raise: principal plus simple interest over the default
         term. */
      const interest =
        (offer.amountBaseUnits * BigInt(listing.requestedAprBps) * BigInt(DEFAULT_DURATION_MS)) /
        (10_000n * 365n * 24n * 60n * 60n * 1000n);
      return {
        id: offer.holdObjectId,
        listingId: pledgeId,
        lenderAccountId: offer.lender,
        principal,
        annualPercentageRateBasisPoints: listing.requestedAprBps,
        durationMs: DEFAULT_DURATION_MS,
        expiresAt: new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString(),
        createdAt: new Date(nowMs).toISOString(),
        status: 'PENDING',
        totalCostToBorrower: toMoneyDto(offer.amountBaseUnits + interest, decimals),
      };
    });
    return {
      ...summary,
      maxPrincipal: toMoneyDto(listing.appraisedValueBaseUnits, decimals),
      offerBook,
    };
  }

  private async toSummary(
    listing: OpenListing,
    decimals: number,
    offerCountByPledge: ReadonlyMap<string, number>,
    nowMs: number,
  ): Promise<ListingSummary> {
    const item = await this.itemOf(listing);
    return {
      id: listing.pledgeId,
      borrowerAccountId: listing.borrower,
      receiptId: listing.receiptKey === '' ? listing.pledgeId : listing.receiptKey,
      requestedPrincipal: toMoneyDto(listing.appraisedValueBaseUnits, decimals),
      maxAnnualPercentageRateBasisPoints: listing.requestedAprBps,
      requestedDurationMs: DEFAULT_DURATION_MS,
      expiresAt: new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString(),
      status: 'ACTIVE',
      appraisedValue: toMoneyDto(listing.appraisedValueBaseUnits, decimals),
      itemCategory: categoryOf(listing.itemCategory),
      itemDescription: item.itemDescription,
      hasPhotograph: item.hasPhotograph,
      loanToValueBasisPoints: CATEGORY_MAX_LOAN_TO_VALUE_BPS,
      bestOfferRateBasisPoints: null,
      categoryMaxLoanToValueBasisPoints: CATEGORY_MAX_LOAN_TO_VALUE_BPS,
    };
  }

  private async itemOf(listing: OpenListing): Promise<ListingItem> {
    const meta = listing.receiptKey === '' ? null : await this.metadata.read(listing.receiptKey);
    return { itemDescription: meta?.name ?? 'Vaulted item', hasPhotograph: meta !== null };
  }
}
