import { Global, Module } from '@nestjs/common';
import { isChainDriverEnabled, loadConfiguration } from '../../config/configuration';
import { SETTLEMENT_PORT } from '../../domain/ports/settlement.port';
import type { SettlementPort } from '../../domain/ports/settlement.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import { UlidIdGeneratorAdapter } from '../id/ulid-id-generator.adapter';
import { LedgerAccountDirectory } from './ledger-account-directory';
import { LedgerSettlementAdapter } from './ledger-settlement.adapter';
import { SuiSettlementAdapter } from './sui-settlement.adapter';

/* The whole Web3 switch for money, as docs/01-architecture.md describes it:
   one factory reading one variable. The chain adapter lives in the chain
   module, which is only in the graph when a chain driver is on, so it is
   optional here and its absence with the driver on is the misconfiguration
   the message names. */
function chooseSettlementPort(
  ledger: LedgerSettlementAdapter,
  sui: SuiSettlementAdapter | undefined,
): SettlementPort {
  if (loadConfiguration().settlementDriver !== 'chain') {
    return ledger;
  }
  if (sui === undefined || !isChainDriverEnabled(loadConfiguration())) {
    throw new Error('SETTLEMENT_DRIVER is chain and the chain module is not in the application');
  }
  return sui;
}

@Global()
@Module({
  providers: [
    LedgerAccountDirectory,
    LedgerSettlementAdapter,
    { provide: ID_GENERATOR, useClass: UlidIdGeneratorAdapter },
    {
      provide: SETTLEMENT_PORT,
      useFactory: chooseSettlementPort,
      inject: [LedgerSettlementAdapter, { token: SuiSettlementAdapter, optional: true }],
    },
  ],
  exports: [SETTLEMENT_PORT, LedgerSettlementAdapter, LedgerAccountDirectory, ID_GENERATOR],
})
export class SettlementModule {}
