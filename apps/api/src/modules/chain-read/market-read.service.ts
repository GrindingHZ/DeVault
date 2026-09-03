import { Injectable } from '@nestjs/common';
import type {
  ListingDetailResponse,
  ListingSummary,
  MyListingResponse,
  RankedOfferResponse,
} from '@depawn/contracts';
import { loanToValueBasisPointsFor, maxLendBaseUnits } from '../../config/loan-to-value';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { ListingsReadService } from './listings-read.service';
import type { PledgeOffer } from './listings-read.service';
import type { OpenListing } from './listings-figures';
import { toMoneyDto } from './chain-read-shapes';

/* The keenest rate standing on a listing, in basis points, or null when nobody
   has offered yet. Lenders compete by undercutting, so the keenest is the
   lowest. */
function bestRateOf(offers: readonly PledgeOffer[]): number | null {
  const rates = offers.map((offer) => offer.aprBps).filter((rate) => rate > 0);
  return rates.length === 0 ? null : Math.min(...rates);
}

/* Self-custody has no requested principal, term, or expiry on an open listing:
   a borrower opens a pledge at a rate and lenders compete on amount. The web2
   listing dtos carry all three, so they are filled with sensible stand-ins the
   ui can render: the principal is the lending ceiling (the appraisal scaled by
   the category's loan-to-value), the term is the platform default, and an open
   pledge does not lapse. */
const DEFAULT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(value: string): ItemCategory {
  return (categories as readonly string[]).includes(value)
    ? (value as ItemCategory)
    : 'COLLECTIBLE';
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

  /* Every open listing, the reader's own included. The workspace filters by tab
     client-side -- browse hides your own, the listings tab shows only them -- so
     stripping them here would leave a borrower's own listings tab always empty. */
  async browse(nowMs: number): Promise<{ items: ListingSummary[] }> {
    const { decimals, listings, offersByPledge } = await this.listings.read();
    const items: ListingSummary[] = [];
    for (const listing of listings) {
      const offers = offersByPledge.get(listing.pledgeId) ?? [];
      items.push(await this.toSummary(listing, decimals, offers, nowMs));
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
        requestedPrincipal: toMoneyDto(listing.requestedPrincipalBaseUnits, decimals),
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
    const { decimals, listings, offersByPledge } = await this.listings.read();
    const listing = listings.find((one) => one.pledgeId === pledgeId);
    if (listing === undefined) {
      return null;
    }
    const offers = offersByPledge.get(pledgeId) ?? [];
    const summary = await this.toSummary(listing, decimals, offers, nowMs);
    const offerBook = offers.map((offer): RankedOfferResponse => {
      const principal = toMoneyDto(offer.amountBaseUnits, decimals);
      /* The whole-term cost at the offer's own rate: lenders compete by
         undercutting, so an offer names the rate the loan would carry, and the
         borrower ranks the book by what each would cost them. */
      const interest =
        (offer.amountBaseUnits * BigInt(offer.aprBps) * BigInt(DEFAULT_DURATION_MS)) /
        (10_000n * 365n * 24n * 60n * 60n * 1000n);
      return {
        id: offer.holdObjectId,
        listingId: pledgeId,
        lenderAccountId: offer.lender,
        principal,
        annualPercentageRateBasisPoints: offer.aprBps,
        durationMs: DEFAULT_DURATION_MS,
        expiresAt: new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString(),
        createdAt: new Date(nowMs).toISOString(),
        status: 'PENDING',
        totalCostToBorrower: toMoneyDto(offer.amountBaseUnits + interest, decimals),
      };
    });
    return {
      ...summary,
      maxPrincipal: toMoneyDto(
        maxLendBaseUnits(listing.appraisedValueBaseUnits, categoryOf(listing.itemCategory)),
        decimals,
      ),
      offerBook,
    };
  }

  private async toSummary(
    listing: OpenListing,
    decimals: number,
    offers: readonly PledgeOffer[],
    nowMs: number,
  ): Promise<ListingSummary> {
    const item = await this.itemOf(listing);
    const category = categoryOf(listing.itemCategory);
    const loanToValueBasisPoints = loanToValueBasisPointsFor(category);
    return {
      id: listing.pledgeId,
      borrowerAccountId: listing.borrower,
      receiptId: listing.receiptKey === '' ? listing.pledgeId : listing.receiptKey,
      requestedPrincipal: toMoneyDto(listing.requestedPrincipalBaseUnits, decimals),
      maxAnnualPercentageRateBasisPoints: listing.requestedAprBps,
      requestedDurationMs: DEFAULT_DURATION_MS,
      expiresAt: new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString(),
      status: 'ACTIVE',
      appraisedValue: toMoneyDto(listing.appraisedValueBaseUnits, decimals),
      itemCategory: category,
      itemDescription: item.itemDescription,
      hasPhotograph: item.hasPhotograph,
      loanToValueBasisPoints,
      /* The rate to beat: the lowest any standing offer has undercut to, or
         none yet if nobody has offered. */
      bestOfferRateBasisPoints: bestRateOf(offers),
      categoryMaxLoanToValueBasisPoints: loanToValueBasisPoints,
    };
  }

  private async itemOf(listing: OpenListing): Promise<ListingItem> {
    const meta = listing.receiptKey === '' ? null : await this.metadata.read(listing.receiptKey);
    return { itemDescription: meta?.name ?? 'Vaulted item', hasPhotograph: meta !== null };
  }
}
