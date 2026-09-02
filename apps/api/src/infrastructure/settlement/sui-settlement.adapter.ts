import { Inject, Injectable } from '@nestjs/common';
import { InsufficientFunds } from '../../domain/ledger/insufficient-funds';
import type { LedgerTransactionKind } from '../../domain/ledger/ledger-transaction';
import { platformAccountIds, platformPurposeOf } from '../../domain/ledger/platform-accounts';
import type {
  FundsHold,
  HoldFundsCommand,
  ReleaseReason,
  SettlementPort,
  TransferCommand,
} from '../../domain/ports/settlement.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { accountIdOf } from '../../domain/shared/identifiers';
import type { AccountId } from '../../domain/shared/identifiers';
import { Money, currencyOf } from '../../domain/shared/money';
import type { Currency } from '../../domain/shared/money';
import type { Distribution, SettlementRef } from '../../domain/shared/settlement-ref';
import { AccountAddressDirectory } from '../chain/account-address.directory';
import type { ChainClient } from '../chain/chain-client';
import type { ChainDeployment } from '../chain/chain-deployment';
import { ChainDeploymentRegistry } from '../chain/chain-deployment.registry';
import type { ChainEvent, ChainExecution } from '../chain/chain-execution';
import { boundedChainRead } from '../chain/chain-reads';
import { CHAIN_CLIENT } from '../chain/chain.tokens';
import {
  chainAmountOf,
  coinTypeFor,
  minorUnitsOf,
  stringFieldOf,
  textOfBytesField,
} from '../chain/ptb/codec';
import {
  appendHold,
  appendMintAndDeposit,
  appendRefundHold,
  appendRelease,
  appendTransfer,
  appendWithdraw,
} from '../chain/ptb/escrow-calls';
import type { ReleasePayment, WalletTarget } from '../chain/ptb/escrow-calls';
import { chainContextOf } from '../chain/sui-unit-of-work';
import type { SuiUnitOfWorkContext } from '../chain/sui-unit-of-work';
import { WalletDirectory } from '../chain/wallet.directory';
import type { ChainWalletRecord } from '../chain/wallet.directory';
import { transactionOf } from '../persistence/prisma-unit-of-work';
import { LedgerSettlementAdapter } from './ledger-settlement.adapter';

/* The settlement port on Sui. Every call records the mirror ledger entries
   first, which keeps the wallet screen, the zero sum assertion and the
   reconciliation basis working, then appends the chain call and answers the
   chain reference. The ledger's own balance check is the pre check; the
   Move abort is the atomic backstop (docs/superpowers/specs/2026-08-25-web3-migration-design.md). */
@Injectable()
export class SuiSettlementAdapter implements SettlementPort {
  constructor(
    private readonly ledger: LedgerSettlementAdapter,
    private readonly addresses: AccountAddressDirectory,
    private readonly wallets: WalletDirectory,
    private readonly deployments: ChainDeploymentRegistry,
    @Inject(CHAIN_CLIENT) private readonly client: ChainClient,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async hold(command: HoldFundsCommand, context: UnitOfWorkContext): Promise<FundsHold> {
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    const mirror = await this.ledger.hold(command, context);
    const wallet = await this.requireFundedWallet(
      command.accountId,
      command.amount.currency,
      context,
    );

    const settlementRef = chain.issueSettlementRef();
    appendHold(chain.chainTransaction, deployment, {
      coinType: coinTypeFor(command.amount.currency, deployment),
      walletId: wallet.objectId,
      holdKey: mirror.id,
      baseUnits: chainAmountOf(command.amount, deployment),
      reference: command.reference,
    });
    await transactionOf(context).chainFundsHold.create({
      data: {
        id: mirror.id,
        accountId: command.accountId,
        currency: command.amount.currency,
        minorUnits: command.amount.minorUnits,
        status: 'HELD',
      },
    });
    chain.onResolved(async (execution) => {
      const held = eventOf(
        execution,
        'FundsHeld',
        (json) => textOfBytesField(json.hold_key) === mirror.id,
      );
      await transactionOf(context).chainFundsHold.update({
        where: { id: mirror.id },
        data: { objectId: stringFieldOf(held.json, 'hold_id'), holdDigest: execution.digest },
      });
    });
    await this.recordSettlement('HOLD_FUNDS', command.reference, mirror.settlementRef, chain);
    return { ...mirror, settlementRef };
  }

  async refundHold(hold: FundsHold, context: UnitOfWorkContext): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    const row = await this.requireHoldRow(hold.id, context);
    const mirrorRef = await this.ledger.refundHold(hold, context);
    if (row.status === 'REFUNDED' && row.settledDigest !== null) {
      return { kind: 'chain', reference: row.settledDigest, settledAt: mirrorRef.settledAt };
    }
    const objectId = requireObjectId(row);
    const currency = currencyOf(row.currency);
    const wallet = await this.requireFundedWallet(accountIdOf(row.accountId), currency, context);

    const settlementRef = chain.issueSettlementRef();
    appendRefundHold(chain.chainTransaction, deployment, {
      coinType: coinTypeFor(currency, deployment),
      holdObjectId: objectId,
      walletId: wallet.objectId,
    });
    await this.settleHoldRow(row.id, 'REFUNDED', chain, context);
    await this.recordSettlement('REFUND_HOLD', hold.id, mirrorRef, chain);
    return settlementRef;
  }

  async releaseHold(
    hold: FundsHold,
    distribution: Distribution[],
    reason: ReleaseReason,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    const row = await this.requireHoldRow(hold.id, context);
    const mirrorRef = await this.ledger.releaseHold(hold, distribution, reason, context);
    if (row.status === 'RELEASED' && row.settledDigest !== null) {
      return { kind: 'chain', reference: row.settledDigest, settledAt: mirrorRef.settledAt };
    }
    const currency = currencyOf(row.currency);
    const payments = await this.paymentsFor(distribution, currency, deployment, chain, context);

    const settlementRef = chain.issueSettlementRef();
    appendRelease(chain.chainTransaction, deployment, {
      coinType: coinTypeFor(currency, deployment),
      holdObjectId: requireObjectId(row),
      reason,
      payments,
    });
    await this.settleHoldRow(row.id, 'RELEASED', chain, context);
    await this.recordSettlement(reason, hold.id, mirrorRef, chain);
    return settlementRef;
  }

  async transfer(command: TransferCommand, context: UnitOfWorkContext): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    const mirrorRef = await this.ledger.transfer(command, context);
    const currency = command.amount.currency;
    const coinType = coinTypeFor(currency, deployment);
    const baseUnits = chainAmountOf(command.amount, deployment);
    const settlementRef = chain.issueSettlementRef();

    if (command.fromAccountId === platformAccountIds.float) {
      // A deposit: minted on a local network, paid from the operator's own
      // stock where USDC is Circle's.
      const to = await this.targetFor(command.toAccountId, currency, chain, context);
      if (deployment.treasuryCapId !== null) {
        appendMintAndDeposit(chain.chainTransaction, deployment, {
          coinType,
          baseUnits,
          to,
          reference: command.reference,
        });
      } else {
        const stock = await this.requireFundedWallet(platformAccountIds.float, currency, context);
        appendTransfer(chain.chainTransaction, deployment, {
          coinType,
          fromWalletId: stock.objectId,
          to,
          baseUnits,
          reference: command.reference,
          reason: command.reason,
        });
      }
    } else if (command.toAccountId === platformAccountIds.float) {
      // A withdrawal: the coin leaves the book to the owner's own address.
      const from = await this.requireFundedWallet(command.fromAccountId, currency, context);
      appendWithdraw(chain.chainTransaction, deployment, {
        coinType,
        walletId: from.objectId,
        baseUnits,
        reference: command.reference,
      });
    } else {
      const from = await this.requireFundedWallet(command.fromAccountId, currency, context);
      const to = await this.targetFor(command.toAccountId, currency, chain, context);
      appendTransfer(chain.chainTransaction, deployment, {
        coinType,
        fromWalletId: from.objectId,
        to,
        baseUnits,
        reference: command.reference,
        reason: command.reason,
      });
    }
    await this.recordSettlement(command.reason, command.reference, mirrorRef, chain);
    return settlementRef;
  }

  /* The chain is authoritative for what a member can spend; the mirror is
     what reconciliation compares it against. */
  async availableBalance(accountId: AccountId, currency: Currency): Promise<Money> {
    const deployment = this.deployments.current();
    const record = await this.wallets.findCommitted(walletAccountOf(accountId), currency);
    if (record === null || record.objectId === null) {
      return Money.zero(currency);
    }
    const objectId = record.objectId;
    const { object } = await boundedChainRead(`wallet ${objectId}`, (signal) =>
      this.client.core.getObject({ objectId, include: { json: true }, signal }),
    );
    const funds = object.json?.funds;
    if (typeof funds !== 'string') {
      throw new Error(`Wallet ${objectId} carries no funds: ${JSON.stringify(object.json)}`);
    }
    return Money.of(minorUnitsOf(BigInt(funds), deployment), currency);
  }

  /* A member with no wallet has nothing to hold or send, which the ledger
     mirror already refused; this is the belt for the braces. */
  private async requireFundedWallet(
    accountId: AccountId,
    currency: Currency,
    context: UnitOfWorkContext,
  ): Promise<ChainWalletRecord & { objectId: string }> {
    const record = await this.wallets.find(walletAccountOf(accountId), currency, context);
    if (record === null || record.objectId === null) {
      throw new InsufficientFunds();
    }
    return { ...record, objectId: record.objectId };
  }

  /* Where a payment lands: the recipient's wallet if it exists, otherwise a
     wallet the same command opens, whose id the commit learns from the
     WalletOpened event naming the owner. */
  private async targetFor(
    accountId: AccountId,
    currency: Currency,
    chain: SuiUnitOfWorkContext,
    context: UnitOfWorkContext,
  ): Promise<WalletTarget> {
    const owner = walletAccountOf(accountId);
    const existing = await this.wallets.find(owner, currency, context);
    if (existing !== null && existing.objectId !== null) {
      return { walletId: existing.objectId };
    }
    const address = await this.addresses.resolve(accountId, context);
    const record =
      existing ?? (await this.wallets.register({ accountId: owner, currency, address }, context));
    chain.onResolved(async (execution) => {
      const opened = eventOf(execution, 'WalletOpened', (json) => json.owner === address);
      await this.wallets.resolveObjectId(
        record.id,
        stringFieldOf(opened.json, 'wallet_id'),
        execution.digest,
        context,
      );
    });
    return { newOwner: address };
  }

  /* Two lines to the same address are one payment on chain: the fee and
     the rounding both belong to the operator's wallet. Zero lines are the
     waterfall's bookkeeping and never a payment (Q-019). */
  private async paymentsFor(
    distribution: readonly Distribution[],
    currency: Currency,
    deployment: ChainDeployment,
    chain: SuiUnitOfWorkContext,
    context: UnitOfWorkContext,
  ): Promise<ReleasePayment[]> {
    const merged = new Map<AccountId, bigint>();
    for (const line of distribution) {
      if (line.amount.isZero()) {
        continue;
      }
      const owner = walletAccountOf(line.accountId);
      merged.set(owner, (merged.get(owner) ?? 0n) + chainAmountOf(line.amount, deployment));
    }
    const payments: ReleasePayment[] = [];
    for (const [owner, amount] of merged) {
      payments.push({
        baseUnits: amount,
        to: await this.targetFor(owner, currency, chain, context),
      });
    }
    return payments;
  }

  private async requireHoldRow(id: string, context: UnitOfWorkContext) {
    const row = await transactionOf(context).chainFundsHold.findUnique({ where: { id } });
    if (row === null) {
      throw new Error(`Funds hold ${id} was never placed on chain`);
    }
    return row;
  }

  private async settleHoldRow(
    id: string,
    status: 'RELEASED' | 'REFUNDED',
    chain: SuiUnitOfWorkContext,
    context: UnitOfWorkContext,
  ): Promise<void> {
    await transactionOf(context).chainFundsHold.update({ where: { id }, data: { status } });
    chain.onResolved(async (execution) => {
      await transactionOf(context).chainFundsHold.update({
        where: { id },
        data: { settledDigest: execution.digest },
      });
    });
  }

  /* One row per settlement: the ledger kind and the mirror transaction now,
     the digest once the commit knows it. */
  private async recordSettlement(
    kind: LedgerTransactionKind,
    reference: string,
    mirrorRef: SettlementRef,
    chain: SuiUnitOfWorkContext,
  ): Promise<void> {
    const id = this.idGenerator.generate();
    await chain.transaction.chainSettlement.create({
      data: {
        id,
        kind,
        reference,
        ledgerTransactionId: mirrorRef.reference,
        occurredAt: new Date(Number(mirrorRef.settledAt.epochMilliseconds)),
      },
    });
    chain.onResolved(async (execution) => {
      await chain.transaction.chainSettlement.update({
        where: { id },
        data: { digest: execution.digest },
      });
    });
  }
}

/* The platform sentinels all mean the operator, whose wallet is filed under
   the float. */
function walletAccountOf(accountId: AccountId): AccountId {
  return platformPurposeOf(accountId) === null ? accountId : platformAccountIds.float;
}

function requireObjectId(row: { readonly id: string; readonly objectId: string | null }): string {
  if (row.objectId === null) {
    throw new Error(`Funds hold ${row.id} has no object on chain yet`);
  }
  return row.objectId;
}

function eventOf(
  execution: ChainExecution,
  name: string,
  matches: (json: Readonly<Record<string, unknown>>) => boolean,
): ChainEvent {
  const event = execution.events.find(
    (candidate) => candidate.name === name && matches(candidate.json),
  );
  if (event === undefined) {
    throw new Error(`Transaction ${execution.digest} emitted no matching ${name}`);
  }
  return event;
}
