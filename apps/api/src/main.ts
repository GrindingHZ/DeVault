import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { OutboxDrainWorker } from './infrastructure/events/outbox-drain.worker';
import { isChainDriverEnabled, loadConfiguration } from './config/configuration';
import { ChainEventIndexer } from './infrastructure/chain/indexer/chain-event.indexer';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRuntime(), {
    bodyParser: false,
  });
  app.use(cookieParser());
  /* Item photographs ride inline in the issue request as base64 data urls, so
     the body parser is opened past its 100kb default. */
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.setGlobalPrefix('api/v1');
  // The drain runs in the serving process only. Tests call drainOnce
  // directly so no timer outlives a suite.
  app.get(OutboxDrainWorker).start(5_000);
  /* The indexer follows the package's events into chain_event; it exists
     only when a chain driver put the chain module in the graph. */
  if (isChainDriverEnabled(loadConfiguration())) {
    app.get(ChainEventIndexer).start(5_000);
  }
  await app.listen(loadConfiguration().httpPort);
}

void bootstrap();
