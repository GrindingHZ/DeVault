import { Inject, Injectable } from '@nestjs/common';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { ListingNotFound } from '../../../domain/marketplace/listing-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { Listing } from '../../../domain/marketplace/listing';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { ListingId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface ExpireListingCommand {
  readonly listingId: ListingId;
}

/* Writing down what the clock already decided.

   Every guard that matters reads the clock, so a listing past its date was
   already refusing offers and already refusing acceptance. What it was not
   doing was saying so: it sat ACTIVE with its date behind it, EXPIRED was a
   status the database could hold and the product never wrote, and anything
   reading the status alone believed the listing was still taking offers
   (docs/14-state-machines.md finding 3).

   One listing per call, one transaction per listing. A sweep that expired
   forty at once would be forty state changes in a transaction the chain
   cannot express as a single call, which is exactly the shape this codebase
   spends its effort avoiding. */
@Injectable()
export class ExpireListingUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  /* No pause check. Pausing stops money and collateral moving; this moves
     neither, and a listing does not stop having run out because the system
     is paused (flow 11). */
  execute(command: ExpireListingCommand): Promise<Result<Listing, DomainError>> {
    return this.unitOfWork.run(async (context) => {
      await this.listings.lock(command.listingId, context);
      const listing = await this.listings.findById(command.listingId, context);
      if (listing === null) {
        return failure(new ListingNotFound());
      }

      /* Re-read against the clock inside the lock. The sweep chose this
         listing a moment ago and its borrower may have cancelled it since,
         or accepted an offer on it, in which case there is nothing to
         expire and saying so is not an error worth raising. */
      const expired = listing.expire(this.clock.now());
      if (!expired.ok) {
        return expired;
      }
      await this.listings.save(expired.value.listing, context);

      /* The offers on it lose the same way they lose to a cancellation, and
         their holds stay held for their owners to pull (rule M8). */
      await this.events.publish(
        expired.value.supersededOfferIds.map((offerId) => ({
          type: 'OfferSuperseded' as const,
          offerId,
          listingId: listing.id,
        })),
        context,
      );
      await this.audit.record(
        {
          actorType: 'SYSTEM',
          actorId: 'market-expiry-sweep',
          subjectType: 'listing',
          subjectId: listing.id,
          action: 'expire_listing',
          before: { status: listing.status },
          after: {
            status: expired.value.listing.status,
            supersededOfferIds: expired.value.supersededOfferIds,
          },
        },
        context,
      );
      return ok(expired.value.listing);
    });
  }
}
