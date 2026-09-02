import { Injectable } from '@nestjs/common';
import type { DomainEventPublisher } from '../../domain/ports/domain-event-publisher.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import type { DomainEvent } from '../../domain/shared/domain-event';
import { ChainDeploymentRegistry } from '../chain/chain-deployment.registry';
import { pendingReferencePrefix } from '../chain/chain-settlement-ref';
import { appendAttest } from '../chain/ptb/attestation-calls';
import { chainContextOf } from '../chain/sui-unit-of-work';
import { OutboxDomainEventPublisher } from './outbox-domain-event-publisher';

/* The outbox as before, and one attestation per event appended to the
   transaction that performs the settlement the event describes, so the
   chain carries the market's whole history and not only its money. */
@Injectable()
export class SuiDomainEventPublisher implements DomainEventPublisher {
  constructor(
    private readonly outbox: OutboxDomainEventPublisher,
    private readonly deployments: ChainDeploymentRegistry,
  ) {}

  async publish(events: DomainEvent[], context: UnitOfWorkContext): Promise<void> {
    await this.outbox.publish(events, context);
    if (events.length === 0) {
      return;
    }
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    for (const event of events) {
      const subject = subjectOf(event);
      appendAttest(chain.chainTransaction, deployment, {
        subjectType: subject.type,
        subjectId: subject.id,
        eventType: event.type,
        payload: attestedPayloadOf(event),
      });
    }
  }
}

const subjectFields: readonly (readonly [string, string])[] = [
  ['loanId', 'loan'],
  ['listingId', 'listing'],
  ['offerId', 'offer'],
  ['receiptId', 'receipt'],
  ['liquidationId', 'liquidation'],
  ['noteSaleId', 'note_sale'],
];

/* The first id an event carries names its aggregate, in the order the
   aggregates own each other: a LoanOriginated names the loan, not the
   listing it came from. */
function subjectOf(event: DomainEvent): { type: string; id: string } {
  const record: Record<string, unknown> = event;
  for (const [field, type] of subjectFields) {
    const value = record[field];
    if (typeof value === 'string') {
      return { type, id: value };
    }
  }
  return { type: 'event', id: event.type };
}

/* The same JSON the outbox stores, with a reference to the settling
   transaction written as `self`: a digest cannot appear in its own events. */
function attestedPayloadOf(event: DomainEvent): string {
  return JSON.stringify(event, (_key, raw: unknown) => {
    if (typeof raw === 'bigint') {
      return raw.toString();
    }
    if (typeof raw === 'string' && raw.startsWith(pendingReferencePrefix)) {
      return 'self';
    }
    return raw;
  });
}
