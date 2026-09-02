import { Global, Module } from '@nestjs/common';
import { isChainDriverEnabled, loadConfiguration } from '../../config/configuration';
import { SYSTEM_STATE_PORT } from '../../domain/ports/system-state.port';
import type { SystemStatePort } from '../../domain/ports/system-state.port';
import { DatabaseSystemStateAdapter } from './database-system-state.adapter';
import { SuiSystemStateAdapter } from './sui-system-state.adapter';

/* Global because the pause check belongs at the entrance of use cases spread
   across several modules. On a chain driver the pause also reaches the chain
   config, through the adapter the chain module provides. */
function chooseSystemStatePort(
  database: DatabaseSystemStateAdapter,
  sui: SuiSystemStateAdapter | undefined,
): SystemStatePort {
  return isChainDriverEnabled(loadConfiguration()) && sui !== undefined ? sui : database;
}

@Global()
@Module({
  providers: [
    DatabaseSystemStateAdapter,
    {
      provide: SYSTEM_STATE_PORT,
      useFactory: chooseSystemStatePort,
      inject: [DatabaseSystemStateAdapter, { token: SuiSystemStateAdapter, optional: true }],
    },
  ],
  exports: [SYSTEM_STATE_PORT, DatabaseSystemStateAdapter],
})
export class SystemStateModule {}
