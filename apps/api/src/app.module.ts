import { Module } from '@nestjs/common';
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { isChainDriverEnabled, loadConfiguration } from './config/configuration';
import { hasAdvanceableClock } from './config/runtime-mode';
import { ChainModule } from './infrastructure/chain/chain.module';
import { ChainTransactionModule } from './modules/chain/chain-transaction.module';
import { ClockModule } from './infrastructure/clock/clock.module';
import { CustodyModule } from './infrastructure/custody/custody.module';
import { ProtocolParametersModule } from './infrastructure/parameters/protocol-parameters.module';
import { PlatformServicesModule } from './infrastructure/platform-services.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { SettlementModule } from './infrastructure/settlement/settlement.module';
import { SystemStateModule } from './infrastructure/system-state/system-state.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AdminApiModule } from './modules/admin/admin-api.module';
import { CustodyApiModule } from './modules/custody/custody-api.module';
import { HealthModule } from './modules/health/health.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { LendingApiModule } from './modules/lending/lending-api.module';
import { MarketplaceApiModule } from './modules/marketplace/marketplace-api.module';
import { SharedHttpModule } from './modules/shared/shared-http.module';
import { TestSupportModule } from './modules/test-support/test-support.module';
import { ApiExceptionFilter } from './modules/shared/http/api-exception.filter';
import { RequestLoggingMiddleware } from './modules/shared/http/request-logging.middleware';

/* Assembled by `forRuntime` rather than by the decorator, because two of the
   imports depend on the environment: the test support routes exist only
   under test or in a demo, so a deployed process has no way to move its own
   clock, and the chain module exists only when a driver asks for it, so a
   Phase 1 process never opens a connection to a node. Reading the
   environment at call time rather than at import time is what lets a test
   suite choose before it boots. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule implements NestModule {
  static forRuntime(): DynamicModule {
    const testOnlyModules = hasAdvanceableClock() ? [TestSupportModule] : [];
    const chainModules = isChainDriverEnabled(loadConfiguration())
      ? [ChainModule, ChainTransactionModule]
      : [];
    return {
      module: AppModule,
      imports: [
        ClockModule,
        PersistenceModule,
        SettlementModule,
        SystemStateModule,
        CustodyModule,
        PlatformServicesModule,
        ProtocolParametersModule,
        SharedHttpModule,
        AccountsModule,
        AdminApiModule,
        LedgerModule,
        CustodyApiModule,
        MarketplaceApiModule,
        LendingApiModule,
        HealthModule,
        ...testOnlyModules,
        ...chainModules,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*splat}');
  }
}
