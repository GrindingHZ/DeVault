import { Global, Module } from '@nestjs/common';
import { isChainDriverEnabled, loadConfiguration } from '../../config/configuration';
import { PROTOCOL_PARAMETERS } from '../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import { PROTOCOL_PARAMETERS_PORT } from '../../domain/ports/protocol-parameters.port';
import type { ProtocolParametersPort } from '../../domain/ports/protocol-parameters.port';
import { ProtocolParametersRegistry } from './protocol-parameters.registry';
import { SuiProtocolParametersAdapter } from './sui-protocol-parameters.adapter';

/* The token still resolves to a plain parameters object, so no use case
   knows that versions exist. The getters read the version in force at the
   moment of the read, which is what makes an effective date mean anything. */
function liveParameters(registry: ProtocolParametersRegistry): ProtocolParameters {
  return {
    get maxLoanToValueBasisPointsByCategory() {
      return registry.current().maxLoanToValueBasisPointsByCategory;
    },
    get maxAnnualPercentageRateBasisPoints() {
      return registry.current().maxAnnualPercentageRateBasisPoints;
    },
    get minimumOfferLifetimeMs() {
      return registry.current().minimumOfferLifetimeMs;
    },
    get originationFeeBasisPoints() {
      return registry.current().originationFeeBasisPoints;
    },
    get liquidationFeeBasisPoints() {
      return registry.current().liquidationFeeBasisPoints;
    },
    get gracePeriodMs() {
      return registry.current().gracePeriodMs;
    },
    get statutoryHoldingPeriodMs() {
      return registry.current().statutoryHoldingPeriodMs;
    },
    get dualAppraisalThreshold() {
      return registry.current().dualAppraisalThreshold;
    },
    get notesTransferable() {
      return registry.current().notesTransferable;
    },
  };
}

@Global()
@Module({
  providers: [
    ProtocolParametersRegistry,
    {
      provide: PROTOCOL_PARAMETERS_PORT,
      useFactory: (
        registry: ProtocolParametersRegistry,
        sui: SuiProtocolParametersAdapter | undefined,
      ): ProtocolParametersPort =>
        isChainDriverEnabled(loadConfiguration()) && sui !== undefined ? sui : registry,
      inject: [ProtocolParametersRegistry, { token: SuiProtocolParametersAdapter, optional: true }],
    },
    {
      provide: PROTOCOL_PARAMETERS,
      useFactory: liveParameters,
      inject: [ProtocolParametersRegistry],
    },
  ],
  exports: [PROTOCOL_PARAMETERS, PROTOCOL_PARAMETERS_PORT, ProtocolParametersRegistry],
})
export class ProtocolParametersModule {}
