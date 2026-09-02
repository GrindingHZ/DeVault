import { Inject, Injectable } from '@nestjs/common';
import type { CustodyReceipt, ReceiptStatus } from '../../../domain/custody/custody-receipt';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { VaultId } from '../../../domain/shared/identifiers';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

const everyStatus: ReceiptStatus[] = ['IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED'];

@Injectable()
export class VaultInventoryQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    private readonly prisma: PrismaService,
  ) {}

  /* Who holds each of these, in one query rather than one per row. Staff at
     a counter are asking whose item this is, and the identifier the screen
     showed before answered a different question. */
  async holderLabels(holderAccountIds: readonly string[]): Promise<Map<string, string>> {
    const distinct = [...new Set(holderAccountIds)];
    if (distinct.length === 0) {
      return new Map();
    }
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: distinct } },
      select: { id: true, email: true },
    });
    return new Map(accounts.map((account) => [account.id, account.email]));
  }

  read(vaultId: VaultId, status: ReceiptStatus | undefined): Promise<readonly CustodyReceipt[]> {
    return this.unitOfWork.run((context) =>
      this.receipts.listByVault(vaultId, status === undefined ? everyStatus : [status], context),
    );
  }
}
