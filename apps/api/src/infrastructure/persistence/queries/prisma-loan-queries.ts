import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Loan as LoanRow } from '@prisma/client';
import type {
  LoanParticipantRole,
  LoanQueries,
  LoanReadModel,
} from '../../../domain/ports/loan-queries.port';
import { accountIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import { toLoan } from '../mappers/lending.mapper';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaLoanQueries implements LoanQueries {
  constructor(private readonly prisma: PrismaService) {}

  async findById(loanId: LoanId): Promise<LoanReadModel | null> {
    const row = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (row === null) {
      return null;
    }
    const [readModel] = await this.withHolders([row]);
    return readModel ?? null;
  }

  async listByParticipant(
    accountId: AccountId,
    role: LoanParticipantRole,
  ): Promise<readonly LoanReadModel[]> {
    const notes =
      role === 'borrower'
        ? await this.prisma.borrowerNote.findMany({
            where: { holderAccountId: accountId },
            select: { loanId: true },
          })
        : await this.prisma.lenderNote.findMany({
            where: { holderAccountId: accountId },
            select: { loanId: true },
          });
    const rows = await this.prisma.loan.findMany({
      where: { id: { in: notes.map((note) => note.loanId) } },
      orderBy: { id: 'desc' },
    });
    return this.withHolders(rows);
  }

  /* Who is owed is whoever holds the lender note, so every read resolves the
     holder; one query for the whole page keeps a long loan list flat. */
  private async withHolders(rows: readonly LoanRow[]): Promise<LoanReadModel[]> {
    if (rows.length === 0) {
      return [];
    }
    const lenderNotes = await this.prisma.lenderNote.findMany({
      where: { loanId: { in: rows.map((row) => row.id) } },
      select: { loanId: true, holderAccountId: true },
    });
    const holderByLoanId = new Map(
      lenderNotes.map((note) => [note.loanId, accountIdOf(note.holderAccountId)]),
    );
    // One more query for the whole page rather than one per row, for the
    // same reason the note holders are resolved in a batch above.
    const receiptIds = rows.map((row) => row.receiptId);
    const receipts = await this.prisma.custodyReceipt.findMany({
      where: { id: { in: receiptIds } },
      select: { id: true, itemDescription: true },
    });
    const descriptionByReceiptId = new Map(
      receipts.map((receipt) => [receipt.id, receipt.itemDescription]),
    );
    /* One more batched query rather than one per row, for the same reason
       the descriptions above are resolved in a batch.

       The predicate is the one the browse read model uses: any evidence
       carrying a verified content type is servable, and evidence written
       before uploads were checked has none, which is what the media endpoint
       refuses. The two have to agree or a row promises a photograph the
       endpoint will not hand over. */
    const photographed = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id
      FROM custody_receipt r
      WHERE r.id IN (${Prisma.join(receiptIds)})
        AND EXISTS (
          SELECT 1 FROM intake_record i
          WHERE i.sealed_hash = r.intake_record_hash
            AND jsonb_path_exists(i.evidence, '$[*].contentType')
        )
    `;
    const withPhotograph = new Set(photographed.map((row) => row.id));
    return rows.map((row) => {
      const holder = holderByLoanId.get(row.id);
      if (holder === undefined) {
        throw new Error(`Loan ${row.id} has no lender note`);
      }
      return {
        loan: toLoan(row),
        lenderNoteHolderAccountId: holder,
        itemDescription: descriptionByReceiptId.get(row.receiptId) ?? '',
        hasPhotograph: withPhotograph.has(row.receiptId),
      };
    });
  }
}
