import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { CHAIN_CLIENT } from '../../infrastructure/chain/chain.tokens';
import { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';

interface Json {
  [key: string]: unknown;
}

function entryOf(object: unknown): { objectId: string; json: Json | null } | null {
  if (object !== null && typeof object === 'object' && !(object instanceof Error)) {
    const record = object as { objectId?: unknown; json?: unknown; code?: unknown };
    if (typeof record.objectId === 'string' && record.code === undefined) {
      const json = record.json;
      return { objectId: record.objectId, json: json === null || json === undefined ? null : (json as Json) };
    }
  }
  return null;
}

function decodeBytes(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = Buffer.from(value, 'base64').toString('utf8');
  return /^[\x20-\x7e]+$/.test(text) ? text : '';
}

function balanceOf(json: Json | null): bigint {
  const balance = json?.balance;
  if (typeof balance === 'string' && /^\d+$/.test(balance)) {
    return BigInt(balance);
  }
  return 0n;
}

/* Resolves the on-chain object ids a build call needs from what the member can
   name. The frontend can no longer read the chain itself, so the ids it once
   passed are looked up here over gRPC: the settlement coin that funds a payment,
   the note that proves a loan, the receipt behind a key. */
@Injectable()
export class ChainObjectResolver {
  constructor(
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    private readonly deployments: ChainDeploymentRegistry,
  ) {}

  /* A single settlement coin holding at least the amount. The build splits the
     exact payment from it and returns the change, so one coin large enough is
     all that is needed; a balance spread thin across coins would have to be
     merged first, which the faucet flow does not produce. */
  async coinForAmount(owner: string, amountBaseUnits: bigint): Promise<string> {
    const deployment = this.deployments.current();
    const coins = await this.client.core.listOwnedObjects({
      owner,
      type: `0x2::coin::Coin<${deployment.settlementCoinType}>`,
      include: { json: true },
    });
    let best: { objectId: string; balance: bigint } | null = null;
    for (const object of coins.objects) {
      const entry = entryOf(object);
      if (entry === null) {
        continue;
      }
      const balance = balanceOf(entry.json);
      if (best === null || balance > best.balance) {
        best = { objectId: entry.objectId, balance };
      }
    }
    if (best === null || best.balance < amountBaseUnits) {
      throw new NotFoundException('No single coin holds enough to fund this. Top up from the faucet.');
    }
    return best.objectId;
  }

  async borrowerNoteForPledge(owner: string, pledgeId: string): Promise<string> {
    return this.noteForPledge(owner, 'BorrowerNote', pledgeId);
  }

  async lenderNoteForPledge(owner: string, pledgeId: string): Promise<string> {
    return this.noteForPledge(owner, 'LenderNote', pledgeId);
  }

  private async noteForPledge(owner: string, note: string, pledgeId: string): Promise<string> {
    const deployment = this.deployments.current();
    const notes = await this.client.core.listOwnedObjects({
      owner,
      type: `${deployment.packageId}::notes::${note}`,
      include: { json: true },
    });
    for (const object of notes.objects) {
      const entry = entryOf(object);
      if (entry !== null && entry.json?.pledge_id === pledgeId) {
        return entry.objectId;
      }
    }
    throw new NotFoundException('You do not hold the note for this loan');
  }

  /* Whether a pledge has matched an offer, and which hold key won. A losing
     lender reclaims by proving the pledge matched a hold that is not theirs, so
     the caller reads that here rather than the escrow depending on the pledge. */
  async pledgeAcceptance(pledgeId: string): Promise<{ matched: boolean; acceptedHoldKey: string }> {
    const objects = await this.client.core.getObjects({ objectIds: [pledgeId], include: { json: true } });
    const entry = entryOf(objects.objects[0]);
    const status = Number(entry?.json?.status ?? 0);
    return { matched: status !== 0, acceptedHoldKey: decodeBytes(entry?.json?.accepted_hold_key) };
  }

  async receiptForKey(owner: string, receiptKey: string): Promise<string> {
    const deployment = this.deployments.current();
    const receipts = await this.client.core.listOwnedObjects({
      owner,
      type: `${deployment.packageId}::custody::VaultReceipt`,
      include: { json: true },
    });
    for (const object of receipts.objects) {
      const entry = entryOf(object);
      if (entry !== null && decodeBytes(entry.json?.receipt_key) === receiptKey) {
        return entry.objectId;
      }
    }
    throw new NotFoundException('You do not hold a receipt with this key');
  }
}
