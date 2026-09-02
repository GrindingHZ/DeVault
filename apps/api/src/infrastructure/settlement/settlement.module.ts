import { Global, Module } from '@nestjs/common';
import { loadConfiguration } from '../../config/configuration';
import { SETTLEMENT_PORT } from '../../domain/ports/settlement.port';
import type { SettlementPort } from '../../domain/ports/settlement.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import { UlidIdGeneratorAdapter } from '../id/ulid-id-generator.adapter';
import { LedgerAccountDirectory } from './ledger-account-directory';
import { LedgerSettlementAdapter } from './ledger-settlement.adapter';
import { SuiSettlementAdapter } from './sui-settlement.adapter';

/* The whole Web3 switch for money, as docs/01-architecture.md describes it:
   one factory reading one variable. */
function chooseSettlementPort(
  ledger: LedgerSettlementAdapter,
  sui: SuiSettlementAdapter,
): SettlementPort {
  return loadConfiguration().settlementDriver === 'chain' ? sui : ledger;
}

@Global()
@Module({
  providers: [
    LedgerAccountDirectory,
    LedgerSettlementAdapter,
    SuiSettlementAdapter,
    { provide: ID_GENERATOR, useClass: UlidIdGeneratorAdapter },
    {
      provide: SETTLEMENT_PORT,
      useFactory: chooseSettlementPort,
      inject: [LedgerSettlementAdapter, SuiSettlementAdapter],
    },
  ],
  exports: [SETTLEMENT_PORT, LedgerSettlementAdapter, LedgerAccountDirectory, ID_GENERATOR],
})
export class SettlementModule {}
