import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { OutboxDrainWorker } from './infrastructure/events/outbox-drain.worker';
import { MarketExpirySweep } from './modules/marketplace/application/market-expiry.sweep';
import { isChainDriverEnabled, loadConfiguration } from './config/configuration';
import { ChainEventIndexer } from './infrastructure/chain/indexer/chain-event.indexer';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule.forRuntime());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  // The drain runs in the serving process only. Tests call drainOnce
  // directly so no timer outlives a suite.
  app.get(OutboxDrainWorker).start(5_000);
  /* And the same for the expiry sweep. A minute is far finer than it needs
     to be for dates measured in days, and coarse enough to cost nothing. */
  app.get(MarketExpirySweep).start(60_000);
  /* The indexer follows the package's events into chain_event; it exists
     only when a chain driver put the chain module in the graph. */
  if (isChainDriverEnabled(loadConfiguration())) {
    app.get(ChainEventIndexer).start(5_000);
  }
  await app.listen(loadConfiguration().httpPort);
}

void bootstrap();
