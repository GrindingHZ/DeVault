import { Inject, Injectable } from '@nestjs/common';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type {
  ProtocolParametersPort,
  ProtocolParameterVersion,
} from '../../domain/ports/protocol-parameters.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ChainDeploymentRegistry } from '../chain/chain-deployment.registry';
import { appendSetParameters } from '../chain/ptb/config-calls';
import { chainContextOf } from '../chain/sui-unit-of-work';
import { ProtocolParametersRegistry } from './protocol-parameters.registry';

/* Versions stay in the database with their effective instants, which is
   what answers what applied on any past day. The chain config carries the
   version in force, written when a version is effective at or before the
   write; a future dated version reaches the chain when a later write or a
   restart applies it, which docs/OPEN-QUESTIONS.md records. */
@Injectable()
export class SuiProtocolParametersAdapter implements ProtocolParametersPort {
  constructor(
    private readonly registry: ProtocolParametersRegistry,
    private readonly deployments: ChainDeploymentRegistry,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  current(): ProtocolParameters {
    return this.registry.current();
  }

  history(): readonly ProtocolParameterVersion[] {
    return this.registry.history();
  }

  reload(): Promise<void> {
    return this.registry.reload();
  }

  async writeVersion(version: ProtocolParameterVersion, context: UnitOfWorkContext): Promise<void> {
    await this.registry.writeVersion(version, context);
    if (version.effectiveAt.isAfter(this.clock.now())) {
      return;
    }
    appendSetParameters(chainContextOf(context).chainTransaction, this.deployments.current(), {
      parameters: version.parameters,
      effectiveAtMs: version.effectiveAt.epochMilliseconds,
    });
  }
}
