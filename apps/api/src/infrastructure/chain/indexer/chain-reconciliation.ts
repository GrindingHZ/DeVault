import { Inject, Injectable } from '@nestjs/common';
import { platformAccountIds } from '../../../domain/ledger/platform-accounts';
import type {
  ChainDrift,
  ChainReconciliationPort,
  ChainReconciliationReport,
} from '../../../domain/ports/chain-reconciliation.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { accountIdOf } from '../../../domain/shared/identifiers';
import { Money, currencyOf } from '../../../domain/shared/money';
import { PrismaService } from '../../persistence/prisma.service';
import { deriveAccountAddress } from '../account-address.directory';
import type { ChainClient } from '../chain-client';
import { ChainDeploymentRegistry } from '../chain-deployment.registry';
import { boundedChainRead } from '../chain-reads';
import { CHAIN_CLIENT, CHAIN_CONFIGURATION } from '../chain.tokens';
import type { ChainConfiguration } from '../../../config/chain-configuration';
import { chainAmountOf } from '../ptb/codec';

const receiptStatusCodes: Record<string, number> = { IN_VAULT: 0, ENCUMBERED: 1 };

/* Diffs the projection against the chain: every live hold, wallet and
   receipt row against the object it names, and the pause flag against the
   config. Drift is an incident, not a report line (docs/10-flows.md flow 10). */
@Injectable()
export class ChainReconciliation implements ChainReconciliationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    @Inject(CHAIN_CONFIGURATION) private readonly configuration: ChainConfiguration,
    private readonly deployments: ChainDeploymentRegistry,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async run(): Promise<ChainReconciliationReport> {
    const drift: ChainDrift[] = [];
    let checked = 0;
    checked += await this.checkHolds(drift);
    checked += await this.checkWallets(drift);
    checked += await this.checkReceipts(drift);
    checked += await this.checkPause(drift);
    return { enabled: true, ranAt: this.clock.now(), checked, drift };
  }

  private async read(objectId: string): Promise<Record<string, unknown> | null> {
    try {
      const { object } = await boundedChainRead(`object ${objectId}`, (signal) =>
        this.client.core.getObject({ objectId, include: { json: true }, signal }),
      );
      return object.json ?? {};
    } catch {
      return null;
    }
  }

  private async checkHolds(drift: ChainDrift[]): Promise<number> {
    const deployment = this.deployments.current();
    const rows = await this.prisma.chainFundsHold.findMany({ where: { status: 'HELD' } });
    for (const row of rows) {
      const json = row.objectId === null ? null : await this.read(row.objectId);
      if (json === null) {
        drift.push({
          subjectType: 'hold',
          subjectId: row.id,
          field: 'object',
          expected: 'exists',
          actual: 'missing',
        });
        continue;
      }
      const expected = chainAmountOf(
        Money.of(row.minorUnits, currencyOf(row.currency)),
        deployment,
      ).toString();
      if (String(json.funds) !== expected) {
        drift.push({
          subjectType: 'hold',
          subjectId: row.id,
          field: 'funds',
          expected,
          actual: String(json.funds),
        });
      }
    }
    return rows.length;
  }

  /* The mirror ledger's available balance is what the wallet must hold; the
     operator's own wallet is not a member balance and is left out. */
  private async checkWallets(drift: ChainDrift[]): Promise<number> {
    const deployment = this.deployments.current();
    const rows = await this.prisma.chainWallet.findMany({
      where: { objectId: { not: null }, accountId: { not: platformAccountIds.float } },
    });
    for (const row of rows) {
      const json = row.objectId === null ? null : await this.read(row.objectId);
      if (json === null) {
        drift.push({
          subjectType: 'wallet',
          subjectId: row.id,
          field: 'object',
          expected: 'exists',
          actual: 'missing',
        });
        continue;
      }
      const mirror = await this.prisma.$queryRaw<{ balance: bigint }[]>`
        SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS balance
        FROM ledger_entry e JOIN ledger_account a ON a.id = e.account_id
        WHERE a.owner_id = ${row.accountId} AND a.purpose = 'USER_AVAILABLE' AND a.currency = ${row.currency}
      `;
      const expected = chainAmountOf(
        Money.of(mirror[0]?.balance ?? 0n, currencyOf(row.currency)),
        deployment,
      ).toString();
      if (String(json.funds) !== expected) {
        drift.push({
          subjectType: 'wallet',
          subjectId: row.id,
          field: 'funds',
          expected,
          actual: String(json.funds),
        });
      }
    }
    return rows.length;
  }

  private async checkReceipts(drift: ChainDrift[]): Promise<number> {
    const rows = await this.prisma.chainReceipt.findMany({
      where: { objectId: { not: null }, burnedDigest: null },
    });
    for (const row of rows) {
      const receipt = await this.prisma.custodyReceipt.findUnique({ where: { id: row.receiptId } });
      const json = row.objectId === null ? null : await this.read(row.objectId);
      if (json === null || receipt === null) {
        drift.push({
          subjectType: 'receipt',
          subjectId: row.receiptId,
          field: 'object',
          expected: 'exists',
          actual: 'missing',
        });
        continue;
      }
      const expectedStatus = receiptStatusCodes[receipt.status];
      if (expectedStatus === undefined || json.status !== expectedStatus) {
        drift.push({
          subjectType: 'receipt',
          subjectId: row.receiptId,
          field: 'status',
          expected: receipt.status,
          actual: String(json.status),
        });
      }
      const expectedHolder = await this.addressOf(receipt.holderAccountId);
      if (json.holder !== expectedHolder) {
        drift.push({
          subjectType: 'receipt',
          subjectId: row.receiptId,
          field: 'holder',
          expected: expectedHolder,
          actual: String(json.holder),
        });
      }
    }
    return rows.length;
  }

  private async checkPause(drift: ChainDrift[]): Promise<number> {
    const state = await this.prisma.systemState.findUnique({ where: { id: 'SYSTEM' } });
    const expected = state !== null && state.pausedAt !== null;
    const json = await this.read(this.deployments.current().configId);
    const actual = json === null ? null : json.paused;
    if (actual !== expected) {
      drift.push({
        subjectType: 'config',
        subjectId: 'SYSTEM',
        field: 'paused',
        expected: String(expected),
        actual: String(actual),
      });
    }
    return 1;
  }

  /* The address the directory would answer, read the same way but outside
     a unit of work: the linked address if one is recorded, the derived one
     otherwise. */
  private async addressOf(accountId: string): Promise<string> {
    const linked = await this.prisma.chainAccountAddress.findUnique({ where: { accountId } });
    if (linked !== null) {
      return linked.address;
    }
    return deriveAccountAddress(this.configuration.accountSeed, accountIdOf(accountId));
  }
}
