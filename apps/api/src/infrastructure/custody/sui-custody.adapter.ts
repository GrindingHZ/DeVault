import { Injectable } from '@nestjs/common';
import type { CustodyReceipt } from '../../domain/custody/custody-receipt';
import type { CustodyPort } from '../../domain/ports/custody.port';
import type { SettlementRef } from '../../domain/shared/settlement-ref';
import { ChainDriverNotReady } from '../chain/chain-driver-not-ready';

/* Phase 3 custody, arriving with P10. Until then the chain driver fails
   here, at the seam, so flipping the switch proves the seam holds. */
@Injectable()
export class SuiCustodyAdapter implements CustodyPort {
  issueReceipt(): Promise<CustodyReceipt> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  transferReceipt(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  encumberReceipt(): Promise<void> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  releaseEncumbrance(): Promise<void> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  claimReceipt(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  burnReceipt(): Promise<SettlementRef> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }

  reissueToBuyer(): Promise<CustodyReceipt> {
    return Promise.reject(new ChainDriverNotReady('CustodyPort'));
  }
}
