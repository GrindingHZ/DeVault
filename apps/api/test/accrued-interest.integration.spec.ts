import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

/* A demo process runs its clock weeks ahead of any browser looking at it
   (docs/10-flows.md flow 15), so accrued interest cannot be worked out on the
   client. These assert that the figure the list carries is the server's own,
   and that it agrees with the payoff quote, which is the disagreement that
   would otherwise go unnoticed. */

const vaultId = 'VAULT-ACCRUAL-1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;
const oneHour = 60 * 60 * 1000;
const thirtyDays = 30 * oneDay;
const millisecondsPerYear = 365n * 24n * 60n * 60n * 1000n;

const principalMinorUnits = 400_000n;
const rateBasisPoints = 1800;

describe('accrued interest on the loan list', () => {
  let harness: TestApplication;
  let borrowerId: string;
  let cookies: string[];
  let sequence = 0;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  function nowMs(): number {
    return Number(harness.clock.now().epochMilliseconds);
  }

  beforeEach(async () => {
    await harness.truncateAllTables();
    sequence = 0;
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Accrual vault',
        city: 'New York',
        insuredLimitMinorUnits: 100_000_000_000n,
        currency: 'USD',
      },
    });
    const email = `borrower-${randomUUID().slice(0, 8)}@accrual.test`;
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    cookies = login.get('Set-Cookie') ?? [];
    const account = await harness.prisma.account.findUnique({ where: { email } });
    borrowerId = account?.id ?? '';
  });

  /* Rows written directly. This suite is about one derived figure, and
     driving a loan through intake, listing, offer and acceptance would bury
     it in setup that proves nothing about accrual. */
  async function loanStartedAgo(elapsedMs: number): Promise<string> {
    sequence += 1;
    const suffix = `${sequence}`.padStart(4, '0');
    const receiptId = `R-ACCRUAL-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrowerId,
        intakeRecordHash: `hash-accrual-${suffix}`,
        appraisedValueMinorUnits: 2_000_000n,
        currency: 'USD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'WATCH',
        itemDescription: 'Titanium diver',
        insurancePolicyReference: 'POL-ACCRUAL',
        status: 'ENCUMBERED',
      },
    });
    const loanId = `L-ACCRUAL-${suffix}`;
    const startedAt = nowMs() - elapsedMs;
    await harness.prisma.loan.create({
      data: {
        id: loanId,
        receiptId,
        borrowerAccountId: borrowerId,
        principalMinorUnits,
        currency: 'USD',
        annualPercentageRateBasisPoints: rateBasisPoints,
        startedAt: new Date(startedAt),
        maturesAt: new Date(startedAt + thirtyDays),
        graceEndsAt: new Date(startedAt + thirtyDays + 7 * oneDay),
        liquidationFeeBasisPoints: 200,
        lenderNoteId: `LN-ACCRUAL-${suffix}`,
        borrowerNoteId: `BN-ACCRUAL-${suffix}`,
        status: 'ACTIVE',
        originationSettlementKind: 'ledger',
        originationSettlementReference: `SR-ACCRUAL-${suffix}`,
        originationSettledAt: new Date(startedAt),
      },
    });
    /* Both notes. Who owes and who is owed are read off the notes rather
       than off the loan row, so a loan without them is invisible to the very
       endpoint under test. */
    await harness.prisma.lenderNote.create({
      data: {
        id: `LN-ACCRUAL-${suffix}`,
        loanId,
        holderAccountId: borrowerId,
        transferable: false,
      },
    });
    await harness.prisma.borrowerNote.create({
      data: {
        id: `BN-ACCRUAL-${suffix}`,
        loanId,
        holderAccountId: borrowerId,
        transferable: false,
      },
    });
    return loanId;
  }

  async function readLoans(): Promise<{ id: string; accruedInterest: { minorUnits: string } }[]> {
    const response = await server()
      .get('/api/v1/me/loans?role=borrower')
      .set('Cookie', cookies)
      .expect(200);
    return response.body.items;
  }

  function expectedAccrual(elapsedMs: number): bigint {
    const clamped = BigInt(Math.min(elapsedMs, thirtyDays));
    return (
      (principalMinorUnits * BigInt(rateBasisPoints) * clamped) / (10_000n * millisecondsPerYear)
    );
  }

  it('carries what an hour of a loan has earned', async () => {
    await loanStartedAgo(oneHour);
    const [loan] = await readLoans();
    expect(loan?.accruedInterest.minorUnits).toBe(expectedAccrual(oneHour).toString());
  });

  /* Rule L1: no interest accrues after maturity. A loan ten days past its
     date owes exactly what it owed on the day. */
  it('stops accruing at maturity', async () => {
    await loanStartedAgo(thirtyDays + 10 * oneDay);
    const [loan] = await readLoans();
    expect(loan?.accruedInterest.minorUnits).toBe(expectedAccrual(thirtyDays).toString());
  });

  /* The assertion that matters. If the list and the quote ever disagree, the
     list is lying about somebody's money. */
  it('agrees with the payoff quote for the same loan', async () => {
    const loanId = await loanStartedAgo(5 * oneDay);
    const [loan] = await readLoans();

    const quote = await server()
      .get(`/api/v1/loans/${loanId}/payoff-quote`)
      .set('Cookie', cookies)
      .expect(200);

    expect(loan?.accruedInterest.minorUnits).toBe(quote.body.accruedInterest.minorUnits);
  });

  it('has earned nothing the instant it starts', async () => {
    await loanStartedAgo(0);
    const [loan] = await readLoans();
    expect(loan?.accruedInterest.minorUnits).toBe('0');
  });
});
