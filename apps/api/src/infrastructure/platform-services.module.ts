import { Global, Module } from '@nestjs/common';
import { isChainDriverEnabled, loadConfiguration } from '../config/configuration';
import { ID_GENERATOR } from '../domain/shared/id-generator';
import { AUDIT_PORT } from '../domain/ports/audit.port';
import { DOMAIN_EVENT_PUBLISHER } from '../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../domain/ports/domain-event-publisher.port';
import { OBJECT_STORAGE_PORT } from '../domain/ports/object-storage.port';
import { PrismaAuditAdapter } from './audit/prisma-audit.adapter';
import { OutboxDomainEventPublisher } from './events/outbox-domain-event-publisher';
import { SuiDomainEventPublisher } from './events/sui-domain-event-publisher';
import {
  LoggingOutboxHandler,
  OUTBOX_HANDLER,
  OutboxDrainWorker,
} from './events/outbox-drain.worker';
import { UlidIdGeneratorAdapter } from './id/ulid-id-generator.adapter';
import { FilesystemObjectStorageAdapter } from './storage/filesystem-object-storage.adapter';

@Global()
@Module({
  providers: [
    { provide: ID_GENERATOR, useClass: UlidIdGeneratorAdapter },
    { provide: AUDIT_PORT, useClass: PrismaAuditAdapter },
    OutboxDomainEventPublisher,
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      useFactory: (
        outbox: OutboxDomainEventPublisher,
        sui: SuiDomainEventPublisher | undefined,
      ): DomainEventPublisher =>
        isChainDriverEnabled(loadConfiguration()) && sui !== undefined ? sui : outbox,
      inject: [OutboxDomainEventPublisher, { token: SuiDomainEventPublisher, optional: true }],
    },
    { provide: OBJECT_STORAGE_PORT, useClass: FilesystemObjectStorageAdapter },
    { provide: OUTBOX_HANDLER, useClass: LoggingOutboxHandler },
    OutboxDrainWorker,
  ],
  exports: [
    ID_GENERATOR,
    AUDIT_PORT,
    DOMAIN_EVENT_PUBLISHER,
    OBJECT_STORAGE_PORT,
    OutboxDrainWorker,
    OutboxDomainEventPublisher,
  ],
})
export class PlatformServicesModule {}
