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
      return {
        objectId: record.objectId,
        json: json === null || json === undefined ? null : (json as Json),
      };
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

function readU64(value: unknown): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return 0n;
}

function readAddress(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/* The pledge's status byte as pledge.move numbers it. */
export const pledgeStatuses = {
  OPEN: 0,
  ACTIVE: 1,
  REPAID: 2,
  DEFAULTED: 3,
  CANCELLED: 4,
  CLOSED: 5,
} as const;

/* A pledge as the chain holds it at the moment of asking: what an action
   against a listing or a loan checks before its transaction is built. */
export interface PledgeState {
  readonly objectId: string;
  readonly status: number;
  readonly borrower: string;
  readonly requestedPrincipalBaseUnits: bigint;
  readonly requestedAprBps: number;
  readonly acceptedHoldKey: string;
  readonly maturesAtMs: bigint;
  readonly gracePeriodMs: bigint;
}

/* A standing offer's hold: which pledge it is against, whose money it is,
   and when it lapses. */
export interface HoldState {
  readonly objectId: string;
  readonly pledgeId: string;
  readonly owner: string;
  readonly expiresAtMs: bigint;
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
      throw new NotFoundException(
        'No single coin holds enough to fund this. Top up from the faucet.',
      );
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

  /* The pledge behind a listing or a loan, read fresh from the chain, or null
     when no such object exists. A pledge is never deleted, so null means the
     id was never a pledge under this package; a listing taken down reads as
     CANCELLED and a collected loan as CLOSED. */
  async pledgeState(pledgeId: string): Promise<PledgeState | null> {
    const objects = await this.client.core.getObjects({
      objectIds: [pledgeId],
      include: { json: true },
    });
    const entry = entryOf(objects.objects[0]);
    if (entry === null || entry.json === null) {
      return null;
    }
    return {
      objectId: entry.objectId,
      status: Number(entry.json.status ?? -1),
      borrower: readAddress(entry.json.borrower),
      requestedPrincipalBaseUnits: readU64(entry.json.requested_principal),
      requestedAprBps: Number(entry.json.requested_apr_bps ?? 0),
      acceptedHoldKey: decodeBytes(entry.json.accepted_hold_key),
      maturesAtMs: readU64(entry.json.matures_at_ms),
      gracePeriodMs: readU64(entry.json.grace_period_ms),
    };
  }

  /* The hold behind an offer, or null once it has been consumed by an
     acceptance or refunded: a hold is deleted on both. */
  async holdState(holdObjectId: string): Promise<HoldState | null> {
    const objects = await this.client.core.getObjects({
      objectIds: [holdObjectId],
      include: { json: true },
    });
    const entry = entryOf(objects.objects[0]);
    if (entry === null || entry.json === null) {
      return null;
    }
    return {
      objectId: entry.objectId,
      pledgeId: readAddress(entry.json.pledge_id),
      owner: readAddress(entry.json.owner),
      expiresAtMs: readU64(entry.json.expires_at),
    };
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
