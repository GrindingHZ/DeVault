import { Inject, Injectable } from '@nestjs/common';
import type {
  ChainReconciliationPort,
  ChainReconciliationReport,
} from '../../../domain/ports/chain-reconciliation.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';

/* What the ledger drivers answer: nothing to compare, honestly said. */
@Injectable()
export class ChainReconciliationUnavailable implements ChainReconciliationPort {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  run(): Promise<ChainReconciliationReport> {
    return Promise.resolve({ enabled: false, ranAt: this.clock.now(), checked: 0, drift: [] });
  }
}
