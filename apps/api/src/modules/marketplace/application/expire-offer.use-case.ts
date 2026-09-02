import { Inject, Injectable } from '@nestjs/common';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { OfferNotFound } from '../../../domain/marketplace/offer-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { OfferId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ExpireOfferCommand {
  readonly offerId: OfferId;
}

/* The offer half of the same job, and it runs first.

   An offer can run out before the listing it sits on does. Swept in this
   order it records its own fate, EXPIRED, rather than inheriting the
   listing's, SUPERSEDED. Both leave the money exactly where it is: refunds
   are pull and not push, and an offer that ran out is as reclaimable as one
   that was beaten (rule M8, flow 9).

   The hold is deliberately untouched, which is why this publishes nothing.
   `OfferSuperseded` says an offer lost to something; nothing here lost to
   anything, the clock simply arrived. */
@Injectable()
export class ExpireOfferUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(command: ExpireOfferCommand): Promise<Result<void, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      const listing = await this.listings.findByOffer(command.offerId, context);
      if (listing === null) {
        return failure(new OfferNotFound());
      }
      await this.listings.lock(listing.id, context);

      /* Re-read inside the lock. The sweep chose this offer a moment ago and
         its lender may have withdrawn it since, or the borrower may have
         accepted it, in which case there is nothing left to expire. */
      const reloaded = await this.listings.findById(listing.id, context);
      if (reloaded === null) {
        return failure(new OfferNotFound());
      }
      const expired = reloaded.expireOffer(command.offerId, this.clock.now());
      if (!expired.ok) {
        return expired;
      }
      await this.listings.save(expired.value, context);
      await this.audit.record(
        {
          actorType: 'SYSTEM',
          actorId: 'market-expiry-sweep',
          subjectType: 'offer',
          subjectId: command.offerId,
          action: 'expire_offer',
          before: { status: 'PENDING' },
          after: { status: 'EXPIRED' },
        },
        context,
      );
      return ok(undefined);
    });
  }
}
