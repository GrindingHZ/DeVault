import { Inject, Injectable } from '@nestjs/common';
import type { LoanResponse, LoanRole } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReceiptMetadataStore } from '../receipt-metadata/receipt-metadata.store';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import {
  accruedBaseUnits,
  notePledgeIdFromJson,
  payoffQuoteWindowMs,
  pledgeStatusOf,
  pledgeTermsFromJson,
} from './wallet-figures';
import type { PledgeStatus, PledgeTerms } from './wallet-figures';
import { DeploymentNotFound } from './wallet-read.service';
import {
  categoryOfPledgeJson,
  fallbackNameFor,
  isoOf,
  objectEntry,
  receiptKeyOf,
  toMoneyDto,
} from './chain-read-shapes';
import type { Json } from './chain-read-shapes';

function loanStatusOf(status: PledgeStatus): LoanResponse['status'] {
  switch (status) {
    case 'repaid':
      return 'REPAID';
    case 'defaulted':
      return 'DEFAULTED';
    default:
      return 'ACTIVE';
  }
}

export interface MyLoansResult {
  readonly items: readonly LoanResponse[];
  readonly asOfMs: number;
}

export interface PayoffQuote {
  readonly loanId: string;
  readonly principal: { minorUnits: string; currency: string };
  readonly accruedInterest: { minorUnits: string; currency: string };
  readonly total: { minorUnits: string; currency: string };
  readonly quotedAtMs: number;
  readonly validUntilMs: number;
}

/* The member's loans, read from the chain and shaped into the LoanResponse the
   restored portfolio speaks. A note the member holds names its pledge; the
   pledge carries the terms, its status, and the wrapped receipt whose key finds
   the item's name and photograph. Lender and borrower are the same read against
   a different note type. */
@Injectable()
export class LoansReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
    private readonly metadata: ReceiptMetadataStore,
  ) {}

  async read(owner: string, role: LoanRole, nowMs: number): Promise<MyLoansResult> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const packageId = deployment.packageId;
    const decimals = deployment.settlementCoinDecimals;
    const noteType = `${packageId}::notes::${role === 'lender' ? 'LenderNote' : 'BorrowerNote'}`;

    const notes = await this.client.core.listOwnedObjects({
      owner,
      type: noteType,
      include: { json: true },
    });
    const held = notes.objects
      .map((object) => objectEntry(object))
      .filter((entry): entry is { objectId: string; json: Json | null } => entry !== null)
      .map((entry) => ({ noteId: entry.objectId, pledgeId: notePledgeIdFromJson(entry.json) }))
      .filter((held): held is { noteId: string; pledgeId: string } => held.pledgeId !== null);
    if (held.length === 0) {
      return { items: [], asOfMs: nowMs };
    }

    const pledgeIds = [...new Set(held.map((one) => one.pledgeId))];
    const pledges = await this.client.core.getObjects({
      objectIds: pledgeIds,
      include: { json: true },
    });
    const pledgeJsonById = new Map<string, Json | null>();
    const termsById = new Map<string, PledgeTerms>();
    for (const object of pledges.objects) {
      const entry = objectEntry(object);
      if (entry === null) {
        continue;
      }
      pledgeJsonById.set(entry.objectId, entry.json);
      const terms = pledgeTermsFromJson(entry.objectId, entry.json);
      if (terms !== null) {
        termsById.set(entry.objectId, terms);
      }
    }

    const items: LoanResponse[] = [];
    for (const one of held) {
      const terms = termsById.get(one.pledgeId);
      if (terms === undefined || pledgeStatusOf(0) === terms.status) {
        continue;
      }
      const pledgeJson = pledgeJsonById.get(one.pledgeId) ?? null;
      const receiptKey = receiptKeyOf(pledgeJson);
      const meta = receiptKey === '' ? null : await this.metadata.read(receiptKey);
      const borrower = typeof pledgeJson?.borrower === 'string' ? pledgeJson.borrower : owner;
      items.push({
        id: terms.pledgeId,
        receiptId: receiptKey === '' ? terms.pledgeId : receiptKey,
        itemDescription: meta?.name ?? fallbackNameFor(categoryOfPledgeJson(pledgeJson)),
        hasPhotograph: meta !== null,
        borrowerAccountId: borrower,
        principal: toMoneyDto(terms.principalBaseUnits, decimals),
        annualPercentageRateBasisPoints: terms.aprBps,
        startedAt: isoOf(terms.startedAtMs),
        maturesAt: isoOf(terms.maturesAtMs),
        graceEndsAt: isoOf(terms.maturesAtMs + terms.gracePeriodMs),
        lenderNoteHolderAccountId: role === 'lender' ? owner : '',
        lenderNoteId: role === 'lender' ? one.noteId : '',
        status: loanStatusOf(terms.status),
        accruedInterest: toMoneyDto(accruedBaseUnits(terms, nowMs), decimals),
        originationSettlementRef: {
          kind: 'chain',
          reference: terms.pledgeId,
          settledAt: isoOf(terms.startedAtMs),
        },
      });
    }
    return { items, asOfMs: nowMs };
  }

  /* What settling a loan costs right now: principal plus interest accrued to
     this instant, quoted for a minute. The chain recomputes the same figure at
     repayment, so this is the number to show, not the number to enforce. */
  async payoffQuote(pledgeId: string, nowMs: number): Promise<PayoffQuote | null> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const decimals = deployment.settlementCoinDecimals;
    const objects = await this.client.core.getObjects({
      objectIds: [pledgeId],
      include: { json: true },
    });
    const entry = objectEntry(objects.objects[0]);
    const terms = entry === null ? null : pledgeTermsFromJson(entry.objectId, entry.json);
    if (terms === null) {
      return null;
    }
    const accrued = accruedBaseUnits(terms, nowMs);
    return {
      loanId: pledgeId,
      principal: toMoneyDto(terms.principalBaseUnits, decimals),
      accruedInterest: toMoneyDto(accrued, decimals),
      total: toMoneyDto(terms.principalBaseUnits + accrued, decimals),
      quotedAtMs: nowMs,
      validUntilMs: nowMs + payoffQuoteWindowMs,
    };
  }
}
