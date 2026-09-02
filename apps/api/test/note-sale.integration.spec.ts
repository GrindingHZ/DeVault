import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-SALE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'USD' } => ({
  minorUnits,
  currency: 'USD',
});

describe('note sale', () => {
  let harness: TestApplication;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Note sale vault',
        city: 'New York',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'USD',
      },
    });
  });

  afterEach(async () => {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'OPERATIONS',
  ): Promise<{ cookies: string[]; accountId: string }> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUnique({ where: { email } });
    if (account === null) {
      throw new Error('registration must create the account');
    }
    return { cookies: login.get('Set-Cookie') ?? [], accountId: account.id };
  }

  async function fund(email: string, minorUnits: string): Promise<void> {
    const ops = await loginAs(`ops-${email}`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
  }

  /* Notes are minted with the parameter in force at origination, so tests
     write the version before the loan exists, not before the listing. */
  async function setTransfers(enabled: boolean): Promise<void> {
    const ops = await loginAs(`params-${randomUUID().slice(0, 8)}@sale.test`, 'OPERATIONS');
    const current = await server()
      .get('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .expect(200);
    await server()
      .put('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        effectiveAt: new Date(Number(harness.clock.now().epochMilliseconds) - 1000).toISOString(),
        parameters: { ...current.body.current, notesTransferable: enabled },
      })
      .expect(200);
  }

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  interface OriginatedLoan {
    readonly loanId: string;
    readonly lenderNoteId: string;
    readonly borrower: Party;
    readonly seller: Party;
  }

  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  async function originate(): Promise<OriginatedLoan> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@sale.test`, 'MEMBER');
    const seller = await loginAs(`seller-${suffix}@sale.test`, 'MEMBER');
    await fund(`seller-${suffix}@sale.test`, '250000');
    await fund(`borrower-${suffix}@sale.test`, '50000');

    const receiptId = `R-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
        intakeRecordHash: `hash-${suffix}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'USD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-${suffix}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId: borrower.accountId,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'USD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30n * oneDay,
        expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 86_400_000),
        status: 'ACTIVE',
      },
    });

    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', seller.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: Number(30n * oneDay),
        expiresAt: new Date(
          Number(harness.clock.now().epochMilliseconds) + 3_600_000,
        ).toISOString(),
      })
      .expect(201);
    const accepted = await server()
      .post(`/api/v1/listings/${listingId}/offers/${offer.body.id}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const lent = await server()
      .get('/api/v1/me/loans?role=lender')
      .set('Cookie', seller.cookies)
      .expect(200);
    const row = lent.body.items.find((item: { id: string }) => item.id === accepted.body.id);

    return {
      loanId: accepted.body.id,
      lenderNoteId: row.lenderNoteId,
      borrower: { ...borrower, email: `borrower-${suffix}@sale.test` },
      seller: { ...seller, email: `seller-${suffix}@sale.test` },
    };
  }

  async function listSale(loan: OriginatedLoan, askMinorUnits: string): Promise<request.Response> {
    return server()
      .post(`/api/v1/notes/${loan.lenderNoteId}/sales`)
      .set('Cookie', loan.seller.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ askPrice: amount(askMinorUnits) })
      .then((response) => response);
  }

  it('sells the position and repayment then pays the buyer', async () => {
    await setTransfers(true);
    const loan = await originate();
    const buyerEmail = `buyer-${randomUUID().slice(0, 8)}@sale.test`;
    const fundedBuyer = await loginAs(buyerEmail, 'MEMBER');
    await fund(buyerEmail, '300000');

    const listed = await listSale(loan, '245000');
    expect(listed.status).toBe(201);
    expect(listed.body.sale.status).toBe('OPEN');
    expect(listed.body.sale.currentValue).toEqual(amount('250000'));
    expect(listed.body.sale.maturityValue).toEqual(amount('253698'));

    const browse = await server()
      .get('/api/v1/market/note-sales')
      .set('Cookie', fundedBuyer.cookies)
      .expect(200);
    expect(browse.body.items).toHaveLength(1);
    expect(browse.body.items[0].askPrice).toEqual(amount('245000'));
    const purchased = await server()
      .post(`/api/v1/sales/${listed.body.sale.id}/purchase`)
      .set('Cookie', fundedBuyer.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(purchased.body.sale.status).toBe('SOLD');
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'SELL_NOTE' } })).toBe(1);

    const sellerBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', loan.seller.cookies)
      .expect(200);
    expect(sellerBalance.body.available).toEqual(amount('245000'));

    const note = await harness.prisma.lenderNote.findUnique({
      where: { id: loan.lenderNoteId },
    });
    expect(note?.holderAccountId).toBe(fundedBuyer.accountId);

    harness.clock.advanceBy(10n * oneDay);
    await signInAgain(loan.borrower);
    const quote = await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.borrower.cookies)
      .expect(200);
    const repaid = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
      .expect(201);
    // The trade moved the claim: repayment pays whoever holds the note now.
    expect(repaid.body.paidToAccountId).toBe(fundedBuyer.accountId);
  });

  it('voids the open sale when the loan is repaid', async () => {
    await setTransfers(true);
    const loan = await originate();
    const listed = await listSale(loan, '245000');
    expect(listed.status).toBe(201);

    const quote = await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.borrower.cookies)
      .expect(200);
    await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
      .expect(201);

    const mine = await server()
      .get('/api/v1/me/note-sales')
      .set('Cookie', loan.seller.cookies)
      .expect(200);
    expect(mine.body.items[0].status).toBe('VOIDED');
  });

  it('refuses a purchase the buyer cannot cover and changes nothing', async () => {
    await setTransfers(true);
    const loan = await originate();
    const listed = await listSale(loan, '245000');
    const broke = await loginAs(`broke-${randomUUID().slice(0, 8)}@sale.test`, 'MEMBER');

    const refused = await server()
      .post(`/api/v1/sales/${listed.body.sale.id}/purchase`)
      .set('Cookie', broke.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(refused.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const note = await harness.prisma.lenderNote.findUnique({
      where: { id: loan.lenderNoteId },
    });
    expect(note?.holderAccountId).toBe(loan.seller.accountId);
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'SELL_NOTE' } })).toBe(0);
    const sale = await harness.prisma.noteSale.findUnique({ where: { id: listed.body.sale.id } });
    expect(sale?.status).toBe('OPEN');
  });

  it('refuses an ask above the current value and names the cap', async () => {
    await setTransfers(true);
    const loan = await originate();
    const refused = await listSale(loan, '250001');
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('ASK_EXCEEDS_CURRENT_VALUE');
    expect(refused.body.error.details.currentValue).toEqual(amount('250000'));
  });

  it('refuses to list while transfers are disabled', async () => {
    // Written off before the mint, so the note itself comes out non
    // transferable and the refusal is the minted field, not the switch.
    await setTransfers(false);
    const loan = await originate();
    const refused = await listSale(loan, '245000');
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('kills listing when the switch is pulled after the mint', async () => {
    await setTransfers(true);
    const loan = await originate();
    await setTransfers(false);
    const refused = await listSale(loan, '245000');
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('NOTE_TRANSFER_DISABLED');
  });

  it('refuses both sides of the loan as buyers', async () => {
    await setTransfers(true);
    const loan = await originate();
    const listed = await listSale(loan, '245000');

    // Ownership is refused before the balance is even read, so neither side
    // needs funding for the refusal to be the one under test.
    for (const party of [loan.seller, loan.borrower]) {
      const refused = await server()
        .post(`/api/v1/sales/${listed.body.sale.id}/purchase`)
        .set('Cookie', party.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(422);
      expect(refused.body.error.code).toBe('CANNOT_BUY_OWN_POSITION');
    }
  });

  it('refuses a second listing while one is open', async () => {
    await setTransfers(true);
    const loan = await originate();
    await listSale(loan, '245000');
    const second = await listSale(loan, '240000');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('NOTE_ALREADY_LISTED');
  });

  it('refuses a purchase after the seller withdraws', async () => {
    await setTransfers(true);
    const loan = await originate();
    const listed = await listSale(loan, '245000');
    await server()
      .post(`/api/v1/sales/${listed.body.sale.id}/withdraw`)
      .set('Cookie', loan.seller.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const buyerEmail = `late-${randomUUID().slice(0, 8)}@sale.test`;
    const buyer = await loginAs(buyerEmail, 'MEMBER');
    await fund(buyerEmail, '300000');
    const refused = await server()
      .post(`/api/v1/sales/${listed.body.sale.id}/purchase`)
      .set('Cookie', buyer.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(refused.body.error.code).toBe('NOTE_SALE_NOT_OPEN');
  });
});
