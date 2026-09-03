import { Inject, Injectable } from '@nestjs/common';
import { CHAIN_RECONCILIATION_PORT } from '../../../domain/ports/chain-reconciliation.port';
import type {
  ChainReconciliationPort,
  ChainReconciliationReport,
} from '../../../domain/ports/chain-reconciliation.port';

/* Flow 10's third column, on demand. Nothing is written: drift is reported
   to a person and never corrected by a job. */
@Injectable()
export class ChainReconciliationQuery {
  constructor(
    @Inject(CHAIN_RECONCILIATION_PORT) private readonly reconciliation: ChainReconciliationPort,
  ) {}

  run(): Promise<ChainReconciliationReport> {
    return this.reconciliation.run();
  }
}
