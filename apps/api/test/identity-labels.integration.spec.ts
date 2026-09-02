import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import type { Role } from '@prisma/client';

/* An identifier may be a secondary reference. It may never be the only thing
   naming a person. The audit trail is the sharpest case: its whole purpose is
   answering who did what, and it answered with two opaque strings. */

const vaultId = 'VAULT-IDENTITY-1';
const password = 'a-long-enough-password';

describe('naming the people behind an identifier', () => {
  let harness: TestApplication;
  let memberEmail: string;
  let memberAccountId: string;
  let opsCookies: string[];
  let staffCookies: string[];

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function registerWithRole(email: string, role: Role): Promise<string> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const account = await harness.prisma.account.findUnique({ where: { email } });
    return account?.id ?? '';
  }

  async function signIn(email: string): Promise<string[]> {
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  beforeEach(async () => {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Identity vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000_000n,
        currency: 'AUD',
      },
    });

    memberEmail = `member-${randomUUID().slice(0, 8)}@identity.test`;
    memberAccountId = await registerWithRole(memberEmail, 'MEMBER');

    const opsEmail = `ops-${randomUUID().slice(0, 8)}@identity.test`;
    await registerWithRole(opsEmail, 'OPERATIONS');
    opsCookies = await signIn(opsEmail);

    const staffEmail = `staff-${randomUUID().slice(0, 8)}@identity.test`;
    await registerWithRole(staffEmail, 'VAULT_STAFF');
    staffCookies = await signIn(staffEmail);
  });

  async function writeAuditRow(actorType: string, actorId: string): Promise<void> {
    await harness.prisma.auditLog.create({
      data: {
        id: `A-${randomUUID().slice(0, 12)}`,
        actorType,
        actorId,
        subjectType: 'listing',
        subjectId: 'L-1',
        action: 'place_offer',
        before: {},
        after: {},
        occurredAt: new Date(Number(harness.clock.now().epochMilliseconds)),
      },
    });
  }

  async function readAudit(): Promise<{ actorId: string; actorLabel: string | null }[]> {
    const response = await server()
      .get('/api/v1/admin/audit-log')
      .set('Cookie', opsCookies)
      .expect(200);
    return response.body.items;
  }

  it('names an account actor by their email', async () => {
    await writeAuditRow('ACCOUNT', memberAccountId);
    const [entry] = await readAudit();
    expect(entry?.actorLabel).toBe(memberEmail);
  });

  it('leaves a staff actor as the identifier staff already quote', async () => {
    await writeAuditRow('STAFF', 'S1');
    const [entry] = await readAudit();
    expect(entry?.actorLabel).toBe('S1');
  });

  /* An audit row must survive the account it names being gone. Dropping it
     would let an account deletion erase its own trail. */
  it('still returns a row whose account no longer exists', async () => {
    await writeAuditRow('ACCOUNT', 'ACCOUNT-THAT-IS-GONE');
    const entries = await readAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorLabel).toBeNull();
    expect(entries[0]?.actorId).toBe('ACCOUNT-THAT-IS-GONE');
  });

  it('names the holder on a vault inventory row', async () => {
    await harness.prisma.custodyReceipt.create({
      data: {
        id: 'R-IDENTITY-1',
        vaultId,
        holderAccountId: memberAccountId,
        intakeRecordHash: 'hash-identity-1',
        appraisedValueMinorUnits: 1_000_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'WATCH',
        itemDescription: 'Titanium diver',
        insurancePolicyReference: 'POL-IDENTITY',
        status: 'IN_VAULT',
      },
    });

    const response = await server()
      .get(`/api/v1/vaults/${vaultId}/inventory`)
      .set('Cookie', staffCookies)
      .expect(200);
    expect(response.body.items[0].holderLabel).toBe(memberEmail);
    /* The identifier stays available as a secondary reference. */
    expect(response.body.items[0].holderAccountId).toBe(memberAccountId);
  });
});
