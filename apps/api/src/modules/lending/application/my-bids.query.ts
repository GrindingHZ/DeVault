import { Injectable } from '@nestjs/common';
import type { LiquidationStatus } from '../../../domain/lending/liquidation';
import type { AccountId } from '../../../domain/shared/identifiers';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

/* A bidder's own bids, which nothing used to answer.

   Bidding holds money the same way offering does, and a beaten bid stays held
   until its owner pulls it back (rule M8, pull not push). The reclaim endpoint
   has always existed; what did not was any way for a bidder to learn there was
   something to reclaim. Their money sat in a hold that no screen could name. */
export interface MyBidRow {
  readonly id: string;
  readonly liquidationId: string;
  readonly itemDescription: string;
  readonly receiptId: string;
  readonly hasPhotograph: boolean;
  readonly amountMinorUnits: bigint;
  readonly currency: string;
  readonly placedAt: Date;
  readonly liquidationStatus: LiquidationStatus;
  readonly closesAt: Date | null;
  /* Whether this bid is the one that would win if the sale closed now, or
     did win if it already has. */
  readonly isStanding: boolean;
  /* Whether the money behind it is still committed. The bid row cannot say:
     reclaiming refunds the hold and writes nothing back to the bid, and a
     settled sale spends the winner's hold rather than refunding it. */
  readonly isHoldHeld: boolean;
}

@Injectable()
export class MyBidsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(bidder: AccountId): Promise<readonly MyBidRow[]> {
    return this.prisma.$queryRaw<MyBidRow[]>`
      SELECT b.id,
             b.liquidation_id AS "liquidationId",
             r.item_description AS "itemDescription",
             r.id AS "receiptId",
             EXISTS (
               SELECT 1 FROM intake_record i
               WHERE i.sealed_hash = r.intake_record_hash
                 AND jsonb_path_exists(i.evidence, '$[*].contentType')
             ) AS "hasPhotograph",
             b.minor_units AS "amountMinorUnits",
             b.currency,
             b.placed_at AS "placedAt",
             l.status AS "liquidationStatus",
             l.closes_at AS "closesAt",
             -- The winner once a sale has settled, and the standing high bid
             -- while it is still taking them.
             CASE
               WHEN l.winning_bid_id IS NOT NULL THEN l.winning_bid_id = b.id
               ELSE b.minor_units = (
                 SELECT MAX(o.minor_units) FROM liquidation_bid o
                 WHERE o.liquidation_id = l.id
               )
             END AS "isStanding",
             h.status = 'HELD' AS "isHoldHeld"
      FROM liquidation_bid b
      JOIN liquidation l ON l.id = b.liquidation_id
      JOIN custody_receipt r ON r.id = l.receipt_id
      JOIN funds_hold h ON h.id = b.funds_hold_id
      WHERE b.bidder_account_id = ${bidder}
      ORDER BY b.placed_at DESC
    `;
  }
}
