import { Inject, Injectable } from '@nestjs/common';
import type { ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import { loanToValueBasisPointsFor } from '../../config/loan-to-value';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { decodeBytes, isoOf, objectEntry, toMoneyDto } from './chain-read-shapes';
import type { Json } from './chain-read-shapes';
import { listingSeeds } from './listings-figures';
import { itemFromJson } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';

const PLEDGE_OPEN = 0;
const PLEDGE_ACTIVE = 1;

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(value: string): ItemCategory {
  return (categories as readonly string[]).includes(value)
    ? (value as ItemCategory)
    : 'COLLECTIBLE';
}

/* The member's own items and their redemptions, read from the chain into the
   receipt and redemption dtos the portfolio speaks. A receipt the member holds
   loose in their wallet is free to borrow against; wrapped in a pledge it is
   either listed for a loan or securing one, and the borrower still needs to see
   it with the state it is in. So an item shows here whether it sits in the
   wallet or inside one of the member's own pledges, and the pledge's status
   decides whether it reads as free (open) or encumbered (funded). Redemption on
   chain is a single burn the member signs, so a request is always at REQUESTED:
   the counter's verify and release are physical, off the chain. */
@Injectable()
export class MemberReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async myReceipts(owner: string): Promise<ReceiptResponse[]> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const owned = await this.client.core.listOwnedObjects({
      owner,
      type: `${deployment.packageId}::custody::VaultReceipt`,
      include: { json: true },
    });
    /* Keyed so a receipt cannot be listed twice if the two reads ever overlap:
       a loose receipt and one wrapped in a pledge are mutually exclusive on
       chain, but the wallet's answer must be one row per item regardless. */
    const byId = new Map<string, ReceiptResponse>();
    for (const object of owned.objects) {
      const entry = objectEntry(object);
      const item = entry === null ? null : itemFromJson(entry.objectId, entry.json);
      if (item === null) {
        continue;
      }
      const meta = item.receiptKey === '' ? null : await this.metadata.read(item.receiptKey);
      const receipt = this.receiptOf(
        item.receiptKey === '' ? item.objectId : item.receiptKey,
        owner,
        item.appraisedValueBaseUnits,
        item.itemCategory,
        meta?.name ?? null,
        meta !== null,
        decimals,
        'IN_VAULT',
        null,
      );
      byId.set(receipt.id, receipt);
    }
    for (const pledged of await this.pledgedReceipts(owner, deployment.packageId, decimals)) {
      if (!byId.has(pledged.id)) {
        byId.set(pledged.id, pledged);
      }
    }
    return [...byId.values()];
  }

  /* The member's items that are inside their own pledges: an open pledge is an
     item listed and still free to redeem once delisted, so it reads as in the
     vault; a funded pledge is collateral, so it reads as encumbered by that
     loan. The pledge ids come from ListingOpened events because a shared object
     cannot be listed by type, and each pledge carries the wrapped receipt whose
     appraisal, category, and key the row is built from. A repaid or defaulted
     pledge no longer holds the receipt, so it is skipped: the receipt has moved
     back to the borrower's wallet or on to the lender. */
  private async pledgedReceipts(
    owner: string,
    packageId: string,
    decimals: number,
  ): Promise<ReceiptResponse[]> {
    const events = await this.client.core.listEvents({
      filter: { eventType: `${packageId}::pledge::ListingOpened` },
      limit: 200,
      order: 'descending',
    });
    const seeds = listingSeeds(events.events.map((event) => ({ json: event.json as Json | null })));
    if (seeds.length === 0) {
      return [];
    }
    const receiptKeyByPledge = new Map(seeds.map((seed) => [seed.pledgeId, seed.receiptKey]));
    const objects = await this.client.core.getObjects({
      objectIds: seeds.map((seed) => seed.pledgeId),
      include: { json: true },
    });
    const receipts: ReceiptResponse[] = [];
    for (const object of objects.objects) {
      const entry = objectEntry(object);
      if (entry === null || entry.json === null || entry.json.borrower !== owner) {
        continue;
      }
      const status = Number(entry.json.status ?? -1);
      if (status !== PLEDGE_OPEN && status !== PLEDGE_ACTIVE) {
        continue;
      }
      const receiptJson =
        typeof entry.json.receipt === 'object' && entry.json.receipt !== null
          ? (entry.json.receipt as Json)
          : null;
      const item = itemFromJson(entry.objectId, receiptJson);
      if (item === null) {
        continue;
      }
      const receiptKey =
        item.receiptKey === '' ? (receiptKeyByPledge.get(entry.objectId) ?? '') : item.receiptKey;
      const meta = receiptKey === '' ? null : await this.metadata.read(receiptKey);
      receipts.push(
        this.receiptOf(
          receiptKey === '' ? entry.objectId : receiptKey,
          owner,
          item.appraisedValueBaseUnits,
          item.itemCategory,
          meta?.name ?? null,
          meta !== null,
          decimals,
          status === PLEDGE_ACTIVE ? 'ENCUMBERED' : 'IN_VAULT',
          status === PLEDGE_ACTIVE ? entry.objectId : null,
        ),
      );
    }
    return receipts;
  }

  private receiptOf(
    id: string,
    owner: string,
    appraisedValueBaseUnits: bigint,
    itemCategory: string,
    name: string | null,
    hasPhotograph: boolean,
    decimals: number,
    status: ReceiptResponse['status'],
    encumberedByLoanId: string | null,
  ): ReceiptResponse {
    const category = categoryOf(itemCategory);
    return {
      id,
      vaultId: '',
      holderAccountId: owner,
      holderLabel: null,
      intakeRecordHash: '',
      appraisedValue: toMoneyDto(appraisedValueBaseUnits, decimals),
      appraisedAt: isoOf(Date.now()),
      itemCategory: category,
      itemDescription: name ?? 'Vaulted item',
      serialNumbers: [],
      hasPhotograph,
      insurancePolicyReference: '',
      status,
      encumberedByLoanId,
      categoryMaxLoanToValueBasisPoints: loanToValueBasisPointsFor(category),
    };
  }

  async myRedemptions(owner: string): Promise<RedemptionRequestResponse[]> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const events = await this.client.core.listEvents({
      filter: { sender: owner },
      limit: 50,
      order: 'descending',
    });
    const requested = `${deployment.packageId}::custody::RedemptionRequested`;
    const items: RedemptionRequestResponse[] = [];
    for (const event of events.events) {
      if (event.eventType !== requested) {
        continue;
      }
      const receiptKey = decodeBytes((event.json as { receipt_key?: unknown } | null)?.receipt_key);
      items.push({
        id: event.transactionDigest,
        receiptId: receiptKey,
        vaultId: '',
        requestedByAccountId: owner,
        requestedAt: isoOf(Date.now()),
        status: 'REQUESTED',
        verifiedAt: null,
        verifiedByStaffId: null,
        releasedAt: null,
        releasedByStaffId: null,
        sealNumberBroken: null,
      });
    }
    return items;
  }
}
