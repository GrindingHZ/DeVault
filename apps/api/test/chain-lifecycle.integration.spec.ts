import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { boundedChainRead } from '../src/infrastructure/chain/chain-reads';
import { chainAmountOf, textOfBytesField } from '../src/infrastructure/chain/ptb/codec';
import { deriveAccountAddress } from '../src/infrastructure/chain/account-address.directory';
import { solidPng } from '../src/infrastructure/storage/solid-png';
import { accountIdOf } from '../src/domain/shared/identifiers';
import { Money, currencyOf } from '../src/domain/shared/money';
import { ChainInspector } from './chain/chain-inspector';
import { chainTestNetwork, isLocalnetReachable, localnetGrpcUrl } from './chain/chain-test-network';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

/* The whole product on the chain drivers, driven through the same endpoints
   the applications call, with the chain read after every step the way a
   person would read an explorer. This is the test that says the loan book
   really runs on Sui (docs/07-phase-plan.md, P10 exit criteria). */
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

const usd = currencyOf('USD');
const vaultId = 'VAULT-CHAIN-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const gracePeriodMs = 7n * oneDay;
const amount = (minorUnits: string): { minorUnits: string; currency: 'USD' } => ({
  minorUnits,
  currency: 'USD',
});

interface Party {
  cookies: string[];
  readonly accountId: string;
  readonly email: string;
  readonly address: string;
}

const network = chainTestNetwork({ settlement: true, custody: true });
const reachable = await isLocalnetReachable();

describe.skipIf(!reachable)(`the loan book on sui (localnet at ${localnetGrpcUrl})`, () => {
  let harness: TestApplication;
  let inspector: ChainInspector;

  beforeAll(async () => {
    harness = await createTestApplication([], {
      environment: network.environment,
      prepare: (databaseUrl) => network.prepare(databaseUrl),
    });
    inspector = new ChainInspector(network.client, network.deployment().packageId);
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Chain vault',
        city: 'New York',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'USD',
      },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  function units(minorUnits: bigint): string {
    return chainAmountOf(Money.of(minorUnits, usd), network.deployment()).toString();
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'OPERATIONS' | 'VAULT_STAFF',
  ): Promise<Party> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUniqueOrThrow({ where: { email } });
    return {
      cookies: login.get('Set-Cookie') ?? [],
      accountId: account.id,
      email,
      address: deriveAccountAddress(network.configuration.accountSeed, accountIdOf(account.id)),
    };
  }

  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  async function post(path: string, party: Party, body: object, status = 201) {
    return server()
      .post(path)
      .set('Cookie', party.cookies)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(status);
  }

  async function walletOf(party: Party): Promise<{ objectId: string; balance: string }> {
    const row = await harness.prisma.chainWallet.findUniqueOrThrow({
      where: { id: `${party.accountId}:USD` },
    });
    const snapshot = await inspector.object(row.objectId ?? '');
    return { objectId: snapshot.objectId, balance: String(snapshot.json.funds) };
  }

  async function operatorWalletBalance(): Promise<string> {
    const row = await harness.prisma.chainWallet.findUniqueOrThrow({
      where: { id: 'PLATFORM_FLOAT:USD' },
    });
    return String((await inspector.object(row.objectId ?? '')).json.funds);
  }

  async function receiptObjectOf(receiptId: string): Promise<string> {
    const row = await harness.prisma.chainReceipt.findUniqueOrThrow({ where: { receiptId } });
    return row.objectId ?? '';
  }

  async function digestResolves(reference: string): Promise<boolean> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await boundedChainRead(`transaction ${reference}`, (signal) =>
          network.client.core.getTransaction({ digest: reference, signal }),
        );
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return false;
  }

  async function issueReceiptThroughIntake(staff: Party, borrower: Party): Promise<string> {
    const begun = await post(`/api/v1/vaults/${vaultId}/intakes`, staff, {
      borrowerEmail: borrower.email,
      itemCategory: 'BULLION',
      itemDescription: 'One kilogram gold bar',
    });
    const intakeId: string = begun.body.id;
    await server()
      .patch(`/api/v1/intakes/${intakeId}`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ serialNumbers: [`SN-${intakeId.slice(-6)}`], sealNumber: 'SEAL-42' })
      .expect(200);
    await server()
      .post(`/api/v1/intakes/${intakeId}/photos`)
      .set('Cookie', staff.cookies)
      .attach('photo', solidPng(32, 32, [201, 153, 47]), 'front.png')
      .expect(201);
    await post(`/api/v1/intakes/${intakeId}/appraisals`, staff, {
      value: amount('500000'),
      method: 'spot times weight',
      comparableReferences: 'LBMA fix',
    });
    await post(`/api/v1/intakes/${intakeId}/seal`, staff, {});
    const issued = await post(`/api/v1/intakes/${intakeId}/issue-receipt`, staff, {
      insurancePolicyReference: 'POL-1',
    });
    return issued.body.id;
  }

  interface Originated {
    readonly loanId: string;
    readonly listingId: string;
    readonly receiptId: string;
    readonly borrower: Party;
    readonly lender: Party;
    readonly ops: Party;
    readonly staff: Party;
    readonly originationReference: string;
  }

  async function originate(): Promise<Originated> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@chain.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@chain.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@chain.test`, 'OPERATIONS');
    const staff = await loginAs(`staff-${suffix}@chain.test`, 'VAULT_STAFF');
    await post('/api/v1/me/deposits', ops, { email: lender.email, amount: amount('250000') });
    const receiptId = await issueReceiptThroughIntake(staff, borrower);
    const listing = await post('/api/v1/listings', borrower, {
      receiptId,
      requestedPrincipal: amount('250000'),
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: Number(30n * oneDay),
      requestedLifetimeMs: Number(oneDay),
    });
    await post(`/api/v1/listings/${listing.body.id}/publish`, borrower, {});
    const offer = await post(`/api/v1/listings/${listing.body.id}/offers`, lender, {
      principal: amount('250000'),
      annualPercentageRateBasisPoints: 1800,
      durationMs: Number(30n * oneDay),
      expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 3_600_000).toISOString(),
    });
    const accepted = await post(
      `/api/v1/listings/${listing.body.id}/offers/${offer.body.id}/accept`,
      borrower,
      {},
    );
    const originationReference: string = accepted.body.originationSettlementRef.reference;
    // Every module's index has caught up with the origination before the
    // caller starts reading what its own steps produce.
    await inspector.syncDigest('escrow', originationReference);
    await inspector.syncDigest('custody', originationReference);
    await inspector.syncDigest('attestation', originationReference);
    return {
      loanId: accepted.body.id,
      listingId: listing.body.id,
      receiptId,
      borrower,
      lender,
      ops,
      staff,
      originationReference,
    };
  }

  function pastGrace(): bigint {
    return 30n * oneDay + gracePeriodMs + oneDay;
  }

  it('originates, repays and redeems with every step visible on chain', async () => {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@chain.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@chain.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@chain.test`, 'OPERATIONS');
    const staff = await loginAs(`staff-${suffix}@chain.test`, 'VAULT_STAFF');
    await inspector.newEvents('escrow', 0);
    await inspector.newEvents('custody', 0);
    await inspector.attestations(0);

    // A deposit mints on the local network and lands in a wallet the lender
    // owns on chain.
    const deposit = await post('/api/v1/me/deposits', ops, {
      email: lender.email,
      amount: amount('250000'),
    });
    expect(deposit.body.settlementRef.kind).toBe('chain');
    expect(await digestResolves(deposit.body.settlementRef.reference)).toBe(true);
    const lenderWallet = await walletOf(lender);
    expect(lenderWallet.balance).toBe(units(250_000n));
    const deposited = await inspector.newEvents('escrow', 2);
    expect(deposited.map((event) => event.name)).toEqual(['WalletOpened', 'FundsDeposited']);
    expect(deposited[1]?.json.owner).toBe(lender.address);

    // The vault issues the receipt: a shared object naming the borrower.
    const receiptId = await issueReceiptThroughIntake(staff, borrower);
    const receiptObject = await receiptObjectOf(receiptId);
    const receipt = await inspector.object(receiptObject);
    expect(receipt.ownerKind).toBe('Shared');
    expect(receipt.json.holder).toBe(borrower.address);
    expect(receipt.json.status).toBe(0);
    expect(textOfBytesField(receipt.json.receipt_key)).toBe(receiptId);
    const issuedEvents = await inspector.newEvents('custody');
    expect(issuedEvents.map((event) => event.name)).toEqual(['ReceiptIssued']);
    expect((await inspector.attestations()).map((event) => event.eventType)).toEqual([
      'ReceiptIssued',
    ]);

    // Listing and offer: the offer holds the lender's money in a hold object.
    const listing = await post('/api/v1/listings', borrower, {
      receiptId,
      requestedPrincipal: amount('250000'),
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: Number(30n * oneDay),
      requestedLifetimeMs: Number(oneDay),
    });
    await post(`/api/v1/listings/${listing.body.id}/publish`, borrower, {});
    expect((await inspector.attestations()).map((event) => event.eventType)).toEqual([
      'ListingPublished',
    ]);
    const offer = await post(`/api/v1/listings/${listing.body.id}/offers`, lender, {
      principal: amount('250000'),
      annualPercentageRateBasisPoints: 1800,
      durationMs: Number(30n * oneDay),
      expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 3_600_000).toISOString(),
    });
    const held = await inspector.newEvents('escrow', 1);
    expect(held.map((event) => event.name)).toEqual(['FundsHeld']);
    expect(held[0]?.json.amount).toBe(units(250_000n));
    const holdRow = await harness.prisma.chainFundsHold.findFirstOrThrow({
      where: { accountId: lender.accountId },
    });
    expect(holdRow.objectId).toBe(held[0]?.json.hold_id);
    expect((await walletOf(lender)).balance).toBe('0');
    expect((await inspector.attestations()).map((event) => event.eventType)).toEqual([
      'OfferPlaced',
    ]);

    // Origination: one transaction releases the hold across the waterfall,
    // encumbers the receipt and attests the loan.
    const accepted = await post(
      `/api/v1/listings/${listing.body.id}/offers/${offer.body.id}/accept`,
      borrower,
      {},
    );
    const originationReference: string = accepted.body.originationSettlementRef.reference;
    expect(accepted.body.originationSettlementRef.kind).toBe('chain');
    expect(originationReference.startsWith('pending:')).toBe(false);
    expect(await digestResolves(originationReference)).toBe(true);
    expect(await inspector.exists(holdRow.objectId ?? '')).toBe(false);
    expect((await walletOf(borrower)).balance).toBe(units(245_000n));
    expect(await operatorWalletBalance()).toBe(units(5_000n));
    const encumbered = await inspector.object(receiptObject);
    expect(encumbered.json.status).toBe(1);
    expect(textOfBytesField(encumbered.json.encumbered_by)).toBe(accepted.body.id);
    const released = await inspector.newEvents('escrow', 5);
    expect(released.map((event) => event.name)).toEqual([
      'HoldReleased',
      'WalletOpened',
      'Paid',
      'WalletOpened',
      'Paid',
    ]);
    expect(released.every((event) => event.digest === originationReference)).toBe(true);
    expect((await inspector.newEvents('custody')).map((event) => event.name)).toEqual([
      'ReceiptEncumbered',
    ]);
    const originationAttested = await inspector.attestations();
    expect(originationAttested.map((event) => event.eventType)).toEqual(['LoanOriginated']);
    expect(originationAttested[0]?.payload).toContain('"reference":"self"');
    const loanRow = await harness.prisma.loan.findUniqueOrThrow({
      where: { id: accepted.body.id },
    });
    expect(loanRow.originationSettlementReference).toBe(originationReference);

    // Repayment pays the note holder's wallet and frees the receipt.
    await post('/api/v1/me/deposits', ops, { email: borrower.email, amount: amount('50000') });
    const quote = await server()
      .get(`/api/v1/loans/${accepted.body.id}/payoff-quote`)
      .set('Cookie', borrower.cookies)
      .expect(200);
    const repaid = await post(`/api/v1/loans/${accepted.body.id}/repay`, borrower, {
      amount: quote.body.total,
      quotedAt: quote.body.quotedAt,
    });
    expect(repaid.body.loan.status).toBe('REPAID');
    expect((await walletOf(lender)).balance).toBe(units(BigInt(quote.body.total.minorUnits)));
    expect((await inspector.object(receiptObject)).json.status).toBe(0);
    // The borrower's wallet already exists from the disbursement, so the
    // deposit that funds the interest opens none; then the repayment moves.
    const repaymentEvents = await inspector.newEvents('escrow', 2);
    expect(repaymentEvents.map((event) => event.name)).toEqual([
      'FundsDeposited',
      'FundsTransferred',
    ]);
    expect((await inspector.newEvents('custody')).map((event) => event.name)).toEqual([
      'EncumbranceReleased',
    ]);
    const repaidAttested = await inspector.attestations();
    expect(repaidAttested.map((event) => event.eventType)).toEqual(['LoanRepaid']);
    expect(repaidAttested[0]?.payload).toContain('"reference":"self"');

    // Redemption burns the object; the vault hands the item over off chain.
    await post(`/api/v1/receipts/${receiptId}/redemption-requests`, borrower, {});
    expect(await inspector.exists(receiptObject)).toBe(false);
    expect((await inspector.newEvents('custody')).map((event) => event.name)).toEqual([
      'RedemptionRequested',
    ]);
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  it('lets the note holder take the collateral after grace, on chain', async () => {
    const loan = await originate();
    expect(await digestResolves(loan.originationReference)).toBe(true);
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);
    await inspector.newEvents('custody', 0);
    await inspector.attestations(0);

    // No money moves on a default, so the only chain trace is the attestation.
    await post(`/api/v1/loans/${loan.loanId}/default`, loan.lender, {});
    expect((await inspector.attestations()).map((event) => event.eventType)).toEqual([
      'LoanDefaulted',
    ]);

    await post(`/api/v1/loans/${loan.loanId}/claim-receipt`, loan.lender, {});
    const receipt = await inspector.object(await receiptObjectOf(loan.receiptId));
    expect(receipt.json.holder).toBe(loan.lender.address);
    expect(receipt.json.status).toBe(0);
    expect(textOfBytesField(receipt.json.encumbered_by)).toBe('');
    expect((await inspector.newEvents('custody')).map((event) => event.name)).toEqual([
      'ReceiptClaimedByLender',
    ]);
    expect((await inspector.attestations()).map((event) => event.eventType)).toEqual([
      'ReceiptClaimedByLender',
    ]);
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  it('sells the collateral at a surplus and pays the waterfall on chain', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);
    await post(`/api/v1/loans/${loan.loanId}/default`, loan.lender, {});
    harness.clock.advanceBy(31n * oneDay);
    await signInAgain(loan.ops);
    const scheduled = await post(`/api/v1/loans/${loan.loanId}/liquidations`, loan.ops, {
      reservePrice: amount('200000'),
    });
    await post(`/api/v1/liquidations/${scheduled.body.id}/open`, loan.ops, {
      biddingWindowMs: Number(7n * oneDay),
    });
    const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@chain.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await post('/api/v1/me/deposits', loan.ops, { email: bidder.email, amount: amount('400000') });
    await inspector.newEvents('escrow', 0);
    await inspector.newEvents('custody', 0);
    await inspector.attestations(0);
    const operatorBefore = BigInt(await operatorWalletBalance());
    const oldReceiptObject = await receiptObjectOf(loan.receiptId);

    await post(`/api/v1/liquidations/${scheduled.body.id}/bids`, bidder, {
      amount: amount('300000'),
    });
    expect((await inspector.newEvents('escrow', 1)).map((event) => event.name)).toEqual([
      'FundsHeld',
    ]);
    expect((await walletOf(bidder)).balance).toBe(units(100_000n));

    const closed = await post(`/api/v1/liquidations/${scheduled.body.id}/close`, loan.ops, {});
    expect(closed.body.status).toBe('SETTLED');
    // 250000 principal plus 3698 interest to maturity to the lender, then
    // 200 basis points of the 46302 remainder to the operator, then the
    // 45376 surplus back to the borrower beside the 245000 disbursed.
    expect((await walletOf(loan.lender)).balance).toBe(units(253_698n));
    expect(BigInt(await operatorWalletBalance()) - operatorBefore).toBe(BigInt(units(926n)));
    expect((await walletOf(loan.borrower)).balance).toBe(units(245_000n + 45_376n));
    expect((await inspector.newEvents('escrow', 4)).map((event) => event.name)).toEqual([
      'HoldReleased',
      'Paid',
      'Paid',
      'Paid',
    ]);

    // The seller's title is spent and the buyer holds a fresh one for the
    // same item, which the vault attests in the same transaction.
    expect(await inspector.exists(oldReceiptObject)).toBe(false);
    const reissuedRow = await harness.prisma.custodyReceipt.findFirstOrThrow({
      where: { holderAccountId: bidder.accountId, status: 'IN_VAULT' },
    });
    const reissued = await inspector.object(await receiptObjectOf(reissuedRow.id));
    expect(reissued.json.holder).toBe(bidder.address);
    expect(textOfBytesField(reissued.json.receipt_key)).toBe(reissuedRow.id);
    expect((await inspector.newEvents('custody', 2)).map((event) => event.name)).toEqual([
      'ReceiptLiquidated',
      'ReceiptIssued',
    ]);
    expect((await inspector.attestations(2)).map((event) => event.eventType)).toEqual([
      'LiquidationSettled',
      'ReceiptIssued',
    ]);

    // Nothing written before the commit still carries a pending token.
    const pendingLoans = await harness.prisma.loan.count({
      where: { originationSettlementReference: { startsWith: 'pending:' } },
    });
    expect(pendingLoans).toBe(0);
    const pendingOutbox = await harness.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM outbox_event WHERE payload::text LIKE '%pending:%'
    `;
    expect(pendingOutbox[0]?.count).toBe(0n);
    const pendingAudit = await harness.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM audit_log
      WHERE after::text LIKE '%pending:%' OR before::text LIKE '%pending:%'
    `;
    expect(pendingAudit[0]?.count).toBe(0n);
    const unresolved = await harness.prisma.chainSettlement.count({ where: { digest: null } });
    expect(unresolved).toBe(0);
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });
});
