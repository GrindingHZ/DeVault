import { Injectable } from '@nestjs/common';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import type { AccountId } from '../../domain/shared/identifiers';
import type { Currency } from '../../domain/shared/money';
import { PrismaService } from '../persistence/prisma.service';
import { transactionOf } from '../persistence/prisma-unit-of-work';

export interface ChainWalletRecord {
  readonly id: string;
  readonly accountId: AccountId;
  readonly currency: Currency;
  readonly address: string;
  /* Null between the transaction that opens the wallet and the commit that
     learns the object id from its effects. */
  readonly objectId: string | null;
}

function rowIdOf(accountId: AccountId, currency: Currency): string {
  return `${accountId}:${currency}`;
}

/* Where each account's available balance lives on chain. Wallets are shared
   objects, so ownership is a field and the api has to remember which object
   is whose; this table is that memory. */
@Injectable()
export class WalletDirectory {
  constructor(private readonly prisma: PrismaService) {}

  /* For reads outside a unit of work, such as a balance query. */
  async findCommitted(accountId: AccountId, currency: Currency): Promise<ChainWalletRecord | null> {
    const row = await this.prisma.chainWallet.findUnique({
      where: { id: rowIdOf(accountId, currency) },
    });
    return row === null
      ? null
      : { id: row.id, accountId, currency, address: row.address, objectId: row.objectId };
  }

  async find(
    accountId: AccountId,
    currency: Currency,
    context: UnitOfWorkContext,
  ): Promise<ChainWalletRecord | null> {
    const row = await transactionOf(context).chainWallet.findUnique({
      where: { id: rowIdOf(accountId, currency) },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      accountId,
      currency,
      address: row.address,
      objectId: row.objectId,
    };
  }

  /* Records that a wallet is being opened in the current transaction. The
     object id arrives with the commit through `resolveObjectId`. */
  async register(
    record: { accountId: AccountId; currency: Currency; address: string },
    context: UnitOfWorkContext,
  ): Promise<ChainWalletRecord> {
    const id = rowIdOf(record.accountId, record.currency);
    await transactionOf(context).chainWallet.upsert({
      where: { id },
      update: { address: record.address },
      create: {
        id,
        accountId: record.accountId,
        currency: record.currency,
        address: record.address,
      },
    });
    return { id, ...record, objectId: null };
  }

  async resolveObjectId(
    id: string,
    objectId: string,
    digest: string,
    context: UnitOfWorkContext,
  ): Promise<void> {
    await transactionOf(context).chainWallet.update({
      where: { id },
      data: { objectId, openedDigest: digest },
    });
  }
}
