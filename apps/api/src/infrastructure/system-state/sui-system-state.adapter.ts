import { Injectable } from '@nestjs/common';
import type {
  PauseCommand,
  SystemState,
  SystemStatePort,
} from '../../domain/ports/system-state.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ChainDeploymentRegistry } from '../chain/chain-deployment.registry';
import { appendPause, appendUnpause } from '../chain/ptb/config-calls';
import { chainContextOf } from '../chain/sui-unit-of-work';
import { DatabaseSystemStateAdapter } from './database-system-state.adapter';

/* The pause lives in two places on purpose: the row, which every use case
   reads at its entrance without a round trip to the node, and the chain
   config, which is what stops a hold even if the row were wrong. Both move
   in the same unit of work; reconciliation compares them. */
@Injectable()
export class SuiSystemStateAdapter implements SystemStatePort {
  constructor(
    private readonly database: DatabaseSystemStateAdapter,
    private readonly deployments: ChainDeploymentRegistry,
  ) {}

  read(context: UnitOfWorkContext): Promise<SystemState> {
    return this.database.read(context);
  }

  async pause(command: PauseCommand, context: UnitOfWorkContext): Promise<SystemState> {
    const state = await this.database.pause(command, context);
    appendPause(chainContextOf(context).chainTransaction, this.deployments.current());
    return state;
  }

  async unpause(context: UnitOfWorkContext): Promise<SystemState> {
    const state = await this.database.unpause(context);
    appendUnpause(chainContextOf(context).chainTransaction, this.deployments.current());
    return state;
  }
}
