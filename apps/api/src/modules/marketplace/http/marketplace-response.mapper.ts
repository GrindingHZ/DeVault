import type {
  ListingResponse,
  ListingSummary,
  MyListingResponse,
  MyOfferResponse,
  OfferResponse,
  RankedOfferResponse,
} from '@depawn/contracts';
import type { Listing } from '../../../domain/marketplace/listing';
import type { Offer } from '../../../domain/marketplace/offer';
import type { RankedOffer } from '../../../domain/marketplace/rank-offers';
import type { MyListingRow } from '../application/my-listings.query';
import type { MyOfferRow } from '../application/my-offers.query';
import type { ListingSummaryReadModel } from '../../../domain/ports/marketplace-queries.port';
import type { Money } from '../../../domain/shared/money';
import { toMoneyDto } from '../../shared/http/money.mapper';

function isoOf(epochMilliseconds: bigint): string {
  return new Date(Number(epochMilliseconds)).toISOString();
}

export function toListingResponse(listing: Listing): ListingResponse {
  return {
    id: listing.id,
    borrowerAccountId: listing.borrowerAccountId,
    receiptId: listing.receiptId,
    requestedPrincipal: toMoneyDto(listing.requestedPrincipal),
    maxAnnualPercentageRateBasisPoints: listing.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: Number(listing.requestedDurationMs),
    expiresAt: isoOf(listing.expiresAt.epochMilliseconds),
    status: listing.status,
  };
}

export function toMyOfferResponse(row: MyOfferRow, lenderAccountId: string): MyOfferResponse {
  return {
    id: row.id,
    listingId: row.listingId,
    lenderAccountId,
    principal: { minorUnits: row.principalMinorUnits.toString(), currency: row.currency },
    annualPercentageRateBasisPoints: row.annualPercentageRateBasisPoints,
    durationMs: Number(row.durationMs),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    itemDescription: row.itemDescription,
  };
}

export function toOfferResponse(offer: Offer): OfferResponse {
  return {
    id: offer.id,
    listingId: offer.listingId,
    lenderAccountId: offer.lenderAccountId,
    principal: toMoneyDto(offer.principal),
    annualPercentageRateBasisPoints: offer.annualPercentageRateBasisPoints,
    durationMs: Number(offer.durationMs),
    expiresAt: isoOf(offer.expiresAt.epochMilliseconds),
    createdAt: isoOf(offer.createdAt.epochMilliseconds),
    status: offer.status,
  };
}

export function toRankedOfferResponse(ranked: RankedOffer): RankedOfferResponse {
  return {
    ...toOfferResponse(ranked.offer),
    totalCostToBorrower: toMoneyDto(ranked.totalCostToBorrower),
  };
}

export function toListingSummary(
  summary: ListingSummaryReadModel,
  categoryMaxLoanToValueBasisPoints: number,
): ListingSummary {
  return {
    id: summary.id,
    borrowerAccountId: summary.borrowerAccountId,
    receiptId: summary.receiptId,
    requestedPrincipal: toMoneyDto(summary.requestedPrincipal),
    maxAnnualPercentageRateBasisPoints: summary.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: Number(summary.requestedDurationMs),
    expiresAt: isoOf(summary.expiresAt.epochMilliseconds),
    status: summary.status,
    appraisedValue: toMoneyDto(summary.appraisedValue),
    itemCategory: summary.itemCategory,
    itemDescription: summary.itemDescription,
    hasPhotograph: summary.hasPhotograph,
    bestOfferRateBasisPoints: summary.bestOfferRateBasisPoints,
    categoryMaxLoanToValueBasisPoints,
    loanToValueBasisPoints: loanToValueBasisPointsOf(
      summary.requestedPrincipal,
      summary.appraisedValue,
    ),
  };
}

/* The share of the appraisal the borrower is asking for. Integer basis points
   throughout, because this is money and a float would drift. An appraisal of
   nothing cannot be divided, and would be a data fault rather than a zero
   risk loan, so it reads as the full ten thousand. */
export function loanToValueBasisPointsOf(principal: Money, appraisedValue: Money): number {
  if (appraisedValue.minorUnits <= 0n) {
    return 10_000;
  }
  return Number((principal.minorUnits * 10_000n) / appraisedValue.minorUnits);
}

export { domainErrorStatusFor as marketplaceStatusFor } from '../../shared/http/domain-error-status';

/* A borrower's own listing. Separate from toListingResponse because the two
   answer different questions: the public one describes an opportunity, this
   one describes something the reader already owns. */
export function toMyListingResponse(
  row: MyListingRow,
  /* Always the caller, so the row does not carry it. Passed rather than
     faked: an empty string here would be a value somebody later reads. */
  borrowerAccountId: string,
): MyListingResponse {
  return {
    id: row.id,
    borrowerAccountId,
    receiptId: row.receiptId,
    requestedPrincipal: {
      minorUnits: row.requestedPrincipalMinorUnits.toString(),
      currency: row.currency,
    },
    maxAnnualPercentageRateBasisPoints: row.maxAnnualPercentageRateBasisPoints,
    requestedDurationMs: Number(row.requestedDurationMs),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    itemDescription: row.itemDescription,
    itemCategory: row.itemCategory,
    bestOfferRateBasisPoints: row.bestOfferRateBasisPoints,
    offerCount: row.offerCount,
  };
}
