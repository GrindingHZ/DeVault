import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface AuditSearchFilters {
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly actorId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface AuditEntryReadModel {
  readonly id: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  /* Who the actor is, rather than which row holds them. Null when the
     account has since gone: the entry is still returned, because an audit
     row that vanishes for want of a join is worse than one with a gap. */
  readonly actorLabel: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly recordedAt: string;
}

export interface AuditPage {
  readonly items: readonly AuditEntryReadModel[];
  readonly nextCursor: string | null;
}

/* The audit trail is append only and read by people investigating a single
   subject, so the filters compose and the cursor walks backwards through
   monotonic ids rather than through timestamps that can tie. */
@Injectable()
export class AuditSearchQuery {
  constructor(private readonly prisma: PrismaService) {}

  /* One query for the whole page, never one per row. An audit screen paging
     through a busy day would otherwise issue twenty five lookups to render
     twenty five lines.

     Only ACCOUNT actors need resolving. A STAFF actor already carries a
     readable identifier, which is what staff quote to each other. */
  private async labelsFor(
    rows: readonly { actorType: string; actorId: string }[],
  ): Promise<Map<string, string>> {
    const accountIds = [
      ...new Set(rows.filter((row) => row.actorType === 'ACCOUNT').map((row) => row.actorId)),
    ];
    const labels = new Map<string, string>();
    for (const row of rows) {
      if (row.actorType !== 'ACCOUNT') {
        labels.set(row.actorId, row.actorId);
      }
    }
    if (accountIds.length === 0) {
      return labels;
    }
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, email: true },
    });
    for (const account of accounts) {
      labels.set(account.id, account.email);
    }
    return labels;
  }

  async search(filters: AuditSearchFilters): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.subjectType === undefined ? {} : { subjectType: filters.subjectType }),
        ...(filters.subjectId === undefined ? {} : { subjectId: filters.subjectId }),
        ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
        ...(filters.cursor === undefined ? {} : { id: { lt: filters.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: filters.limit + 1,
    });

    const page = rows.slice(0, filters.limit);
    const last = page.at(-1);
    const labels = await this.labelsFor(page);
    return {
      items: page.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId,
        actorLabel: labels.get(row.actorId) ?? null,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        action: row.action,
        before: row.before,
        after: row.after,
        recordedAt: row.occurredAt.toISOString(),
      })),
      nextCursor: rows.length > filters.limit && last !== undefined ? last.id : null,
    };
  }
}
