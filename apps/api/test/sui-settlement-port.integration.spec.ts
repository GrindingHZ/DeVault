import { describeSettlementPortContract } from '@depawn/test-support';
import { afterEach, describe, it, vi } from 'vitest';
import { platformAccountIds } from '../src/domain/ledger/platform-accounts';
import { UNIT_OF_WORK } from '../src/domain/ports/unit-of-work';
import type { UnitOfWork } from '../src/domain/ports/unit-of-work';
import { accountIdOf } from '../src/domain/shared/identifiers';
import type { AccountId } from '../src/domain/shared/identifiers';
import { Money, currencyOf } from '../src/domain/shared/money';
import { boundedChainRead } from '../src/infrastructure/chain/chain-reads';
import { minorUnitsOf } from '../src/infrastructure/chain/ptb/codec';
import { SuiSettlementAdapter } from '../src/infrastructure/settlement/sui-settlement.adapter';
import { chainTestNetwork, isLocalnetReachable, localnetGrpcUrl } from './chain/chain-test-network';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const usd = currencyOf('USD');
let harness: TestApplication | undefined;
let accountCounter = 0;

afterEach(async () => {
  if (harness !== undefined) {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  }
});

/* A chain suite waits on the node, whose patience is two minutes per
   transaction; the timeouts sit above it so a stall is reported with the
   node's last answer rather than as a bare timeout. */
vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

const reachable = await isLocalnetReachable();

if (!reachable) {
  describe.skip(`SettlementPort contract: sui (no localnet at ${localnetGrpcUrl})`, () => {
    it('needs a running localnet', () => undefined);
  });
} else {
  describeSettlementPortContract('sui', async () => {
    const network = chainTestNetwork({ settlement: true });
    harness = await createTestApplication([], {
      environment: network.environment,
      prepare: (databaseUrl) => network.prepare(databaseUrl),
    });
    const activeHarness = harness;
    const adapter = activeHarness.app.get(SuiSettlementAdapter);
    const unitOfWork = activeHarness.app.get<UnitOfWork>(UNIT_OF_WORK);

    /* Held money is the sum of the live hold objects on chain, which is what
       the chain calls the distinction the ledger calls USER_HELD. */
    async function heldBalanceOf(accountId: AccountId): Promise<bigint> {
      const rows = await activeHarness.prisma.chainFundsHold.findMany({
        where: { accountId, status: 'HELD' },
      });
      let total = 0n;
      for (const row of rows) {
        if (row.objectId === null) {
          continue;
        }
        const objectId = row.objectId;
        const { object } = await boundedChainRead(`hold ${objectId}`, (signal) =>
          network.client.core.getObject({ objectId, include: { json: true }, signal }),
        );
        const funds = object.json?.funds;
        total += minorUnitsOf(
          BigInt(typeof funds === 'string' ? funds : '0'),
          network.deployment(),
        );
      }
      return total;
    }

    return {
      port: adapter,
      runInUnitOfWork: (work) => unitOfWork.run(work),
      async createAccountWithBalance(minorUnits: bigint): Promise<AccountId> {
        accountCounter += 1;
        const accountId = accountIdOf(`SUI-CONTRACT-${accountCounter}`);
        if (minorUnits > 0n) {
          await unitOfWork.run((context) =>
            adapter.transfer(
              {
                fromAccountId: platformAccountIds.float,
                toAccountId: accountId,
                amount: Money.of(minorUnits, usd),
                reference: `seed-${accountCounter}`,
                reason: 'DEPOSIT',
              },
              context,
            ),
          );
        }
        return accountId;
      },
      async availableBalanceOf(accountId: AccountId): Promise<bigint> {
        return (await adapter.availableBalance(accountId, usd)).minorUnits;
      },
      heldBalanceOf,
      /* A digest is answered once the node has checkpointed the transaction,
         which trails execution by a moment, so the lookup polls. */
      async referenceExists(settlementRef): Promise<boolean> {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          try {
            await boundedChainRead(`transaction ${settlementRef.reference}`, (signal) =>
              network.client.core.getTransaction({ digest: settlementRef.reference, signal }),
            );
            return true;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        return false;
      },
      async transactionKindOf(reference): Promise<string> {
        const row = await activeHarness.prisma.chainSettlement.findFirst({
          where: { digest: reference },
        });
        if (row === null) {
          throw new Error(`No chain settlement with digest ${reference}`);
        }
        return row.kind;
      },
      close: () => activeHarness.close(),
    };
  });
}
