import { Inject, Injectable } from '@nestjs/common';
import type { ReceiptResponse, RedemptionRequestResponse } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { decodeBytes, isoOf, objectEntry, toMoneyDto } from './chain-read-shapes';
import { itemFromJson } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';

const categories = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;
type ItemCategory = (typeof categories)[number];

function categoryOf(value: string): ItemCategory {
  return (categories as readonly string[]).includes(value) ? (value as ItemCategory) : 'COLLECTIBLE';
}

/* The member's own items and their redemptions, read from the chain into the
   receipt and redemption dtos the portfolio speaks. A receipt the member holds
   loose in their wallet is in the vault under their name; wrapped in a pledge it
   is not theirs to see here. Redemption on chain is a single burn the member
   signs, so a request is always at REQUESTED: the counter's verify and release
   are physical, off the chain. */
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
    const receipts: ReceiptResponse[] = [];
    for (const object of owned.objects) {
      const entry = objectEntry(object);
      const item = entry === null ? null : itemFromJson(entry.objectId, entry.json);
      if (item === null) {
        continue;
      }
      const meta = item.receiptKey === '' ? null : await this.metadata.read(item.receiptKey);
      receipts.push({
        id: item.receiptKey === '' ? item.objectId : item.receiptKey,
        vaultId: '',
        holderAccountId: owner,
        holderLabel: null,
        intakeRecordHash: '',
        appraisedValue: toMoneyDto(item.appraisedValueBaseUnits, decimals),
        appraisedAt: isoOf(Date.now()),
        itemCategory: categoryOf(item.itemCategory),
        itemDescription: meta?.name ?? 'Vaulted item',
        serialNumbers: [],
        hasPhotograph: meta !== null,
        insurancePolicyReference: '',
        status: 'IN_VAULT',
        encumberedByLoanId: null,
      });
    }
    return receipts;
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
