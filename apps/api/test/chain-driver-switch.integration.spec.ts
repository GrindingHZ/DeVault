import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CUSTODY_PORT } from '../src/domain/ports/custody.port';
import type { CustodyPort } from '../src/domain/ports/custody.port';
import { SETTLEMENT_PORT } from '../src/domain/ports/settlement.port';
import type { SettlementPort } from '../src/domain/ports/settlement.port';
import {
  accountIdOf,
  listingIdOf,
  receiptIdOf,
  staffIdOf,
  vaultIdOf,
} from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { ChainDriverNotReady } from '../src/infrastructure/chain/chain-driver-not-ready';
import { SuiCustodyAdapter } from '../src/infrastructure/custody/sui-custody.adapter';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { SuiSettlementAdapter } from '../src/infrastructure/settlement/sui-settlement.adapter';
import { CreateListingUseCase } from '../src/modules/marketplace/application/create-listing.use-case';
import { PlaceOfferUseCase } from '../src/modules/marketplace/application/place-offer.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const usd = currencyOf('USD');
const vaultId = 'VAULT-SWITCH';
const borrower = accountIdOf('SWITCH-BORROWER');
const lender = accountIdOf('SWITCH-LENDER');

/* The P9 exit criterion in docs/07-phase-plan.md: flipping a driver to the
   chain fails at the port boundary and nowhere else. A leak would show up as
   a use case that never reaches the port failing, or as a port failure
   dressed as something else. */
describe('chain driver switch', () => {
  let harness: TestApplication;
  const previous = {
    settlement: process.env.SETTLEMENT_DRIVER,
    custody: process.env.CUSTODY_DRIVER,
  };

  beforeAll(async () => {
    process.env.SETTLEMENT_DRIVER = 'chain';
    process.env.CUSTODY_DRIVER = 'chain';
    harness = await createTestApplication();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Switch vault',
        city: 'New York',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'USD',
      },
    });
    await harness.prisma.custodyReceipt.create({
      data: {
        id: 'R-SWITCH',
        vaultId,
        holderAccountId: borrower,
        intakeRecordHash: 'hash-switch',
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
  });

  afterAll(async () => {
    await harness.close();
    restore('SETTLEMENT_DRIVER', previous.settlement);
    restore('CUSTODY_DRIVER', previous.custody);
  });

  it('binds both ports to the chain adapters', () => {
    expect(harness.app.get<SettlementPort>(SETTLEMENT_PORT)).toBeInstanceOf(SuiSettlementAdapter);
    expect(harness.app.get<CustodyPort>(CUSTODY_PORT)).toBeInstanceOf(SuiCustodyAdapter);
  });

  it('still runs a use case that never reaches a port', async () => {
    const created = await harness.app.get(CreateListingUseCase).execute({
      requestedBy: borrower,
      receiptId: receiptIdOf('R-SWITCH'),
      requestedPrincipal: Money.of(250_000n, usd),
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 2_592_000_000n,
      requestedLifetimeMs: 86_400_000n,
    });
    expect(created.ok).toBe(true);
  });

  it('fails a settlement at the port and leaves no offer behind', async () => {
    const listing = await harness.prisma.listing.findFirstOrThrow();
    await harness.prisma.listing.update({ where: { id: listing.id }, data: { status: 'ACTIVE' } });

    await expect(
      harness.app.get(PlaceOfferUseCase).execute({
        listingId: listingIdOf(listing.id),
        lenderAccountId: lender,
        principal: Money.of(250_000n, usd),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000n,
        expiresAt: Instant.fromEpochMilliseconds(
          harness.clock.now().epochMilliseconds + 86_400_000n,
        ),
      }),
    ).rejects.toBeInstanceOf(ChainDriverNotReady);
    expect(await harness.prisma.offer.count()).toBe(0);
  });

  it('fails custody at the port', async () => {
    const custody = harness.app.get<CustodyPort>(CUSTODY_PORT);
    await expect(
      harness.app.get(PrismaUnitOfWork).run((context) =>
        custody.issueReceipt(
          {
            vaultId: vaultIdOf(vaultId),
            holderAccountId: borrower,
            intakeRecordHash: 'hash-switch-2',
            appraisedValue: Money.of(500_000n, usd),
            appraisedAt: Instant.fromEpochMilliseconds(0n),
            appraiserId: staffIdOf('S1'),
            itemCategory: 'BULLION',
            itemDescription: 'One kilogram gold bar, cast',
            serialNumbers: [],
            insurancePolicyReference: 'POL-1',
          },
          context,
        ),
      ),
    ).rejects.toThrow(/CustodyPort/);
  });
});

function restore(variable: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[variable];
  } else {
    process.env[variable] = value;
  }
}
