import { Injectable } from '@nestjs/common';
import type { FundsHold, SettlementPort } from '../../domain/ports/settlement.port';
import type { Money } from '../../domain/shared/money';
import type { SettlementRef } from '../../domain/shared/settlement-ref';
import { ChainDriverNotReady } from '../chain/chain-driver-not-ready';

/* Phase 3 settlement, arriving with P10. Until then the chain driver fails
   here, at the seam, so flipping the switch proves the seam holds. */
@Injectable()
export class SuiSettlementAdapter implements SettlementPort {
  hold(): Promise<FundsHold> {
    return Promise.reject(new ChainDriverNotReady('SettlementPort'));
  }

  releaseHold(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('SettlementPort'));
  }

  refundHold(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('SettlementPort'));
  }

  transfer(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('SettlementPort'));
  }

  availableBalance(): Promise<Money> {
    return Promise.reject(new ChainDriverNotReady('SettlementPort'));
  }
}
