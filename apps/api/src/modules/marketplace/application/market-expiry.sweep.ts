import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ExpireListingUseCase } from './expire-listing.use-case';
import { ExpireOfferUseCase } from './expire-offer.use-case';

export interface SweepResult {
  readonly offersExpired: number;
  readonly listingsExpired: number;
}

/* The clock catching up with the database.

   For most of the build nothing swept: `Listing.expire` and `Offer.expire`
   were coded, drawn, and never fired, so EXPIRED was a status the schema
   could hold and the product never wrote. That was contained rather than
   harmless. Every guard reads the clock, so nothing was ever accepted late,
   but every screen reading the status alone believed a listing was still
   taking offers and an offer was still standing, and the portfolio had to
   grow its own clock arithmetic to stop lying about it.

   Offers first, then listings. An offer can run out before the listing it
   sits on does, and swept in this order it records its own fate rather than
   inheriting the listing's.

   One transaction per row, never one for the batch. Forty expiries in one
   transaction is forty state changes the chain cannot express as one call,
   and the whole point of the seam is that it can. */
@Injectable()
export class MarketExpirySweep implements OnModuleDestroy {
  private readonly logger = new Logger(MarketExpirySweep.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly expireOffer: ExpireOfferUseCase,
    private readonly expireListing: ExpireListingUseCase,
  ) {}

  /* Started explicitly rather than on module init, for the reason the outbox
     drain is: a test suite must never inherit a timer it did not ask for. */
  start(intervalMs: number): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.sweepOnce().catch((error: unknown) => {
        this.logger.error(`the market expiry sweep failed: ${String(error)}`);
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  async sweepOnce(): Promise<SweepResult> {
    const now = this.clock.now();
    /* Read outside the write transactions on purpose. The list is a set of
       candidates, not a set of guarantees: each use case takes its own lock
       and re-reads against the clock, so a row that stopped qualifying in
       between is refused rather than forced. */
    const [offerIds, listingIds] = await this.unitOfWork.run(async (context) => [
      await this.listings.listExpiredPendingOfferIds(now, context),
      await this.listings.listExpiredActiveIds(now, context),
    ]);

    let offersExpired = 0;
    for (const offerId of offerIds) {
      const result = await this.expireOffer.execute({ offerId });
      if (result.ok) {
        offersExpired += 1;
      }
    }

    let listingsExpired = 0;
    for (const listingId of listingIds) {
      const result = await this.expireListing.execute({ listingId });
      if (result.ok) {
        listingsExpired += 1;
      }
    }

    if (offersExpired > 0 || listingsExpired > 0) {
      this.logger.log(`expired ${offersExpired} offers and ${listingsExpired} listings`);
    }
    return { offersExpired, listingsExpired };
  }
}
