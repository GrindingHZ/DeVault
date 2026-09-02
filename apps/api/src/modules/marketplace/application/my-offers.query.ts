import { Injectable } from '@nestjs/common';
import type { OfferStatus } from '../../../domain/marketplace/offer';
import type { AccountId } from '../../../domain/shared/identifiers';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

/* A lender's own offers used to be a column of amounts against nothing: the
   listing id is how our systems refer to the thing, not what the thing is.
   The item travels with the row so a reader can tell one hold from another. */
export interface MyOfferRow {
  readonly id: string;
  readonly listingId: string;
  readonly itemDescription: string;
  readonly receiptId: string;
  readonly hasPhotograph: boolean;
  readonly principalMinorUnits: bigint;
  readonly currency: string;
  readonly annualPercentageRateBasisPoints: number;
  readonly durationMs: bigint;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly status: OfferStatus;
  /* Whether the money behind this offer is still held.

     The offer row cannot answer that on its own. Reclaiming refunds the hold
     without writing a status back, deliberately: a superseded offer stays
     superseded because that is what happened to it (rule M8). So the hold is
     the only thing that knows whether there is anything left to reclaim, and
     a screen without it goes on asking for money that is already home. */
  readonly isHoldHeld: boolean;
}

@Injectable()
export class MyOffersQuery {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(lender: AccountId): Promise<readonly MyOfferRow[]> {
    return this.prisma.$queryRaw<MyOfferRow[]>`
      SELECT o.id,
             o.listing_id AS "listingId",
             r.item_description AS "itemDescription",
             r.id AS "receiptId",
             -- Any evidence carrying a verified content type is servable.
             -- Evidence written before uploads were checked has none, and the
             -- media endpoint refuses it, so the two agree.
             EXISTS (
               SELECT 1 FROM intake_record i
               WHERE i.sealed_hash = r.intake_record_hash
                 AND jsonb_path_exists(i.evidence, '$[*].contentType')
             ) AS "hasPhotograph",
             o.principal_minor_units AS "principalMinorUnits",
             o.currency,
             o.annual_percentage_rate_basis_points AS "annualPercentageRateBasisPoints",
             o.duration_ms AS "durationMs",
             o.expires_at AS "expiresAt",
             o.offered_at AS "createdAt",
             o.status,
             h.status = 'HELD' AS "isHoldHeld"
      FROM offer o
      JOIN listing l ON l.id = o.listing_id
      JOIN custody_receipt r ON r.id = l.receipt_id
      JOIN funds_hold h ON h.id = o.funds_hold_id
      WHERE o.lender_account_id = ${lender}
      ORDER BY o.offered_at DESC
    `;
  }
}
