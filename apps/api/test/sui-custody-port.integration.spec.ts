import { describeCustodyPortContract } from '@depawn/test-support';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Vault } from '../src/domain/custody/vault';
import type { IssueReceiptCommand } from '../src/domain/ports/custody.port';
import { UNIT_OF_WORK } from '../src/domain/ports/unit-of-work';
import type { UnitOfWork } from '../src/domain/ports/unit-of-work';
import { accountIdOf, receiptIdOf, staffIdOf, vaultIdOf } from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { boundedChainRead } from '../src/infrastructure/chain/chain-reads';
import { SuiCustodyAdapter } from '../src/infrastructure/custody/sui-custody.adapter';
import { PrismaCustodyReceiptRepository } from '../src/infrastructure/persistence/repositories/prisma-custody-receipt.repository';
import { PrismaVaultRepository } from '../src/infrastructure/persistence/repositories/prisma-vault.repository';
import { chainTestNetwork, isLocalnetReachable, localnetGrpcUrl } from './chain/chain-test-network';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const usd = currencyOf('USD');
let commandCounter = 0;
let harness: TestApplication | undefined;
const network = chainTestNetwork({ custody: true });
const vaultId = vaultIdOf('CONTRACT-VAULT');

function issueCommand(holder: string, category: 'BULLION' | 'WATCH'): IssueReceiptCommand {
  commandCounter += 1;
  return {
    vaultId,
    holderAccountId: accountIdOf(holder),
    intakeRecordHash: `hash-${commandCounter}`,
    appraisedValue: Money.of(500_000n, usd),
    appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
    appraiserId: staffIdOf('CONTRACT-APPRAISER'),
    itemCategory: category,
    itemDescription: 'One kilogram gold bar, cast',
    serialNumbers: ['PM-2024-AU1-0084213'],
    insurancePolicyReference: 'POL-CONTRACT',
  };
}

/* A chain suite waits on the node, whose patience is two minutes per
   transaction; the timeouts sit above it so a stall is reported with the
   node's last answer rather than as a bare timeout. */
vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

const reachable = await isLocalnetReachable();

if (!reachable) {
  describe.skip(`CustodyPort contract: sui (no localnet at ${localnetGrpcUrl})`, () => {
    it('needs a running localnet', () => undefined);
  });
} else {
  describeCustodyPortContract('sui', async () => {
    harness = await createTestApplication([], {
      environment: network.environment,
      prepare: (databaseUrl) => network.prepare(databaseUrl),
    });
    const activeHarness = harness;
    const adapter = activeHarness.app.get(SuiCustodyAdapter);
    const unitOfWork = activeHarness.app.get<UnitOfWork>(UNIT_OF_WORK);
    const receipts = activeHarness.app.get(PrismaCustodyReceiptRepository);
    const vaults = activeHarness.app.get(PrismaVaultRepository);

    await unitOfWork.run((context) =>
      vaults.save(
        Vault.create({
          id: vaultId,
          name: 'Contract vault',
          city: 'New York',
          insuredLimit: Money.of(100_000_000n, usd),
        }),
        context,
      ),
    );

    return {
      port: adapter,
      runInUnitOfWork: (work) => unitOfWork.run(work),
      nextIssueCommand: () => issueCommand(`CONTRACT-BORROWER-${commandCounter + 1}`, 'BULLION'),
      receiptById: (id) => unitOfWork.run((context) => receipts.findById(receiptIdOf(id), context)),
      // Closed once for the whole file, after the object assertions below.
      close: () => Promise.resolve(),
    };
  });

  afterAll(async () => {
    await harness?.close();
  });

  /* What the database subject cannot assert: the object itself. */
  describe('CustodyPort contract: sui, the objects', () => {
    it('shares a receipt object the vault attests and deletes it on a burn', async () => {
      if (harness === undefined) {
        throw new Error('The contract suite did not boot the application');
      }
      const activeHarness = harness;
      const adapter = activeHarness.app.get(SuiCustodyAdapter);
      const unitOfWork = activeHarness.app.get<UnitOfWork>(UNIT_OF_WORK);
      const issued = await unitOfWork.run((context) =>
        adapter.issueReceipt(issueCommand('CONTRACT-OBJECT-HOLDER', 'WATCH'), context),
      );
      const row = await activeHarness.prisma.chainReceipt.findUniqueOrThrow({
        where: { receiptId: issued.id },
      });
      expect(row.objectId).not.toBeNull();
      const objectId = row.objectId ?? '';
      const { object } = await boundedChainRead(`receipt ${objectId}`, (signal) =>
        network.client.core.getObject({ objectId, include: { json: true }, signal }),
      );
      expect(object.owner.$kind).toBe('Shared');
      expect(object.json?.status).toBe(0);
      expect(object.json?.item_category).toBe(1);
      expect(object.json?.appraised_value).toBe('5000000000');

      const reference = await unitOfWork.run((context) =>
        adapter.burnReceipt(issued.id, 'REDEMPTION', context),
      );
      expect(reference.kind).toBe('chain');
      await expect(
        boundedChainRead(`receipt ${objectId}`, (signal) =>
          network.client.core.getObject({ objectId, include: { json: true }, signal }),
        ),
      ).rejects.toThrow();
    });
  });
}
