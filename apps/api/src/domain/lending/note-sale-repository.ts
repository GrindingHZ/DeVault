import type { LoanId, NoteSaleId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { NoteSale } from './note-sale';

export interface NoteSaleRepository {
  findById(id: NoteSaleId, context: UnitOfWorkContext): Promise<NoteSale | null>;
  /* One open sale per loan is an invariant, so the singular return is honest:
     the partial unique index in the schema is what makes it safe. */
  findOpenByLoanId(loanId: LoanId, context: UnitOfWorkContext): Promise<NoteSale | null>;
  create(sale: NoteSale, context: UnitOfWorkContext): Promise<void>;
  save(sale: NoteSale, context: UnitOfWorkContext): Promise<void>;
}

export const NOTE_SALE_REPOSITORY = Symbol('NoteSaleRepository');
