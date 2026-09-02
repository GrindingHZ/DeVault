import { Injectable } from '@nestjs/common';
import type { NoteSale } from '../../../domain/lending/note-sale';
import type { NoteSaleRepository } from '../../../domain/lending/note-sale-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { LoanId, NoteSaleId } from '../../../domain/shared/identifiers';
import { toNoteSale, toNoteSaleRow } from '../mappers/lending.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleNoteSaleVersionError extends Error {
  constructor(noteSaleId: string) {
    super(`Note sale ${noteSaleId} was modified concurrently`);
    this.name = 'StaleNoteSaleVersionError';
  }
}

@Injectable()
export class PrismaNoteSaleRepository implements NoteSaleRepository {
  async findById(id: NoteSaleId, context: UnitOfWorkContext): Promise<NoteSale | null> {
    const row = await transactionOf(context).noteSale.findUnique({ where: { id } });
    return row === null ? null : toNoteSale(row);
  }

  async findOpenByLoanId(loanId: LoanId, context: UnitOfWorkContext): Promise<NoteSale | null> {
    const row = await transactionOf(context).noteSale.findFirst({
      where: { loanId, status: 'OPEN' },
    });
    return row === null ? null : toNoteSale(row);
  }

  async create(sale: NoteSale, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).noteSale.create({ data: { ...toNoteSaleRow(sale), version: 0 } });
  }

  async save(sale: NoteSale, context: UnitOfWorkContext): Promise<void> {
    const updated = await transactionOf(context).noteSale.updateMany({
      where: { id: sale.id, version: sale.version },
      data: { ...toNoteSaleRow(sale), version: sale.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleNoteSaleVersionError(sale.id);
    }
  }
}
