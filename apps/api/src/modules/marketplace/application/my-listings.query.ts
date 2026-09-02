import { Injectable } from '@nestjs/common';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type { ListingStatus } from '../../../domain/marketplace/listing';
import type { AccountId } from '../../../domain/shared/identifiers';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

/* A flat row rather than a hydrated aggregate, which is what
   docs/01-architecture.md asks of a list view.

   It carries the item because a borrower's own listings used to be a column
   of identifiers: the receipt id is how our systems refer to the thing, not
   what the thing is. And it carries the best standing rate, because the
   question a borrower has about their own listing is what it would cost them
   to accept right now. */
export interface MyListingRow {
  readonly id: string;
  readonly receiptId: string;
  readonly itemDescription: string;
  readonly itemCategory: ItemCategory;
  readonly requestedPrincipalMinorUnits: bigint;
  readonly currency: string;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly requestedDurationMs: bigint;
  readonly expiresAt: Date;
  readonly status: ListingStatus;
  /* Null when nobody has offered. Not zero, which would read as free money. */
  readonly bestOfferRateBasisPoints: number | null;
  readonly offerCount: number;
}

interface MyListingSqlRow extends Omit<MyListingRow, 'offerCount'> {
  readonly offer_count: bigint;
}

@Injectable()
export class MyListingsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(borrower: AccountId): Promise<readonly MyListingRow[]> {
    const rows = await this.prisma.$queryRaw<MyListingSqlRow[]>`
      SELECT l.id,
             l.receipt_id AS "receiptId",
             r.item_description AS "itemDescription",
             r.item_category AS "itemCategory",
             l.requested_principal_minor_units AS "requestedPrincipalMinorUnits",
             l.currency,
             l.max_annual_percentage_rate_basis_points AS "maxAnnualPercentageRateBasisPoints",
             l.requested_duration_ms AS "requestedDurationMs",
             l.expires_at AS "expiresAt",
             l.status,
             (
               SELECT MIN(o.annual_percentage_rate_basis_points)
               FROM offer o
               WHERE o.listing_id = l.id AND o.status = 'PENDING'
             ) AS "bestOfferRateBasisPoints",
             (
               SELECT COUNT(*)
               FROM offer o
               WHERE o.listing_id = l.id AND o.status = 'PENDING'
             ) AS offer_count
      FROM listing l
      JOIN custody_receipt r ON r.id = l.receipt_id
      WHERE l.borrower_account_id = ${borrower}
      ORDER BY l.id DESC
    `;
    return rows.map((row) => ({ ...row, offerCount: Number(row.offer_count) }));
  }
}
