import type { Prisma } from '@prisma/client';

/* Every column a settlement reference can land in before the commit knows
   the digest. The loan stores its origination reference as a column; the
   outbox and the audit log carry it inside JSON. Adding a home for a
   reference means adding a line here, and the chain lifecycle test asserts
   no pending token survives a commit. */
export async function patchPendingReferences(
  transaction: Prisma.TransactionClient,
  token: string,
  digest: string,
  since: Date,
): Promise<void> {
  await transaction.$executeRaw`
    UPDATE loan SET origination_settlement_reference = ${digest}
    WHERE origination_settlement_reference = ${token}
  `;
  await transaction.$executeRaw`
    UPDATE outbox_event
    SET payload = replace(payload::text, ${token}, ${digest})::jsonb
    WHERE occurred_at >= ${since} AND payload::text LIKE ${`%${token}%`}
  `;
  await transaction.$executeRaw`
    UPDATE audit_log
    SET after = replace(after::text, ${token}, ${digest})::jsonb
    WHERE occurred_at >= ${since} AND after::text LIKE ${`%${token}%`}
  `;
  await transaction.$executeRaw`
    UPDATE audit_log
    SET before = replace(before::text, ${token}, ${digest})::jsonb
    WHERE occurred_at >= ${since} AND before::text LIKE ${`%${token}%`}
  `;
}
