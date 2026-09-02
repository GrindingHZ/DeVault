import { Injectable } from '@nestjs/common';
import type { CustodyReceipt } from '../../domain/custody/custody-receipt';
import type { BurnReason, CustodyPort, IssueReceiptCommand } from '../../domain/ports/custody.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import type { AccountId, LoanId, ReceiptId } from '../../domain/shared/identifiers';
import type { SettlementRef } from '../../domain/shared/settlement-ref';
import { AccountAddressDirectory } from '../chain/account-address.directory';
import { ChainDeploymentRegistry } from '../chain/chain-deployment.registry';
import type { ChainEvent, ChainExecution } from '../chain/chain-execution';
import { chainAmountOf, stringFieldOf, textOfBytesField } from '../chain/ptb/codec';
import {
  appendBurnForLiquidation,
  appendBurnForRedemption,
  appendClaim,
  appendEncumber,
  appendIssueReceipt,
  appendReissueToBuyer,
  appendReleaseEncumbrance,
  appendTransferHolder,
} from '../chain/ptb/custody-calls';
import { chainContextOf } from '../chain/sui-unit-of-work';
import type { SuiUnitOfWorkContext } from '../chain/sui-unit-of-work';
import { transactionOf } from '../persistence/prisma-unit-of-work';
import { DatabaseCustodyAdapter } from './database-custody.adapter';

/* The custody port on Sui. The receipt row stays the projection every read
   model uses, written by the database adapter first so a rejected transition
   surfaces as the same domain error it always did; the object is the truth,
   appended to the unit of work's transaction, and chain_receipt maps one to
   the other (docs/superpowers/specs/2026-08-25-web3-migration-design.md). */
@Injectable()
export class SuiCustodyAdapter implements CustodyPort {
  constructor(
    private readonly database: DatabaseCustodyAdapter,
    private readonly addresses: AccountAddressDirectory,
    private readonly deployments: ChainDeploymentRegistry,
  ) {}

  async issueReceipt(
    command: IssueReceiptCommand,
    context: UnitOfWorkContext,
  ): Promise<CustodyReceipt> {
    const chain = chainContextOf(context);
    const deployment = this.deployments.current();
    const receipt = await this.database.issueReceipt(command, context);
    appendIssueReceipt(chain.chainTransaction, deployment, {
      receiptKey: receipt.id,
      vault: receipt.vaultId,
      holder: await this.addresses.resolve(receipt.holderAccountId, context),
      intakeHash: receipt.intakeRecordHash,
      appraisedValue: chainAmountOf(receipt.appraisedValue, deployment),
      appraisedAtMs: receipt.appraisedAt.epochMilliseconds,
      itemCategory: receipt.itemCategory,
      insuranceReference: receipt.insurancePolicyReference,
    });
    await this.rememberIssued(receipt.id, chain, context);
    return receipt;
  }

  async transferReceipt(
    receiptId: ReceiptId,
    toHolder: AccountId,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    await this.database.transferReceipt(receiptId, toHolder, context);
    appendTransferHolder(chain.chainTransaction, this.deployments.current(), {
      receiptObjectId: await this.requireObjectId(receiptId, context),
      to: await this.addresses.resolve(toHolder, context),
    });
    return chain.issueSettlementRef();
  }

  async encumberReceipt(
    receiptId: ReceiptId,
    loanId: LoanId,
    context: UnitOfWorkContext,
  ): Promise<void> {
    const chain = chainContextOf(context);
    await this.database.encumberReceipt(receiptId, loanId, context);
    appendEncumber(chain.chainTransaction, this.deployments.current(), {
      receiptObjectId: await this.requireObjectId(receiptId, context),
      loanKey: loanId,
    });
  }

  async releaseEncumbrance(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<void> {
    const chain = chainContextOf(context);
    await this.database.releaseEncumbrance(receiptId, context);
    appendReleaseEncumbrance(chain.chainTransaction, this.deployments.current(), {
      receiptObjectId: await this.requireObjectId(receiptId, context),
    });
  }

  async claimReceipt(
    receiptId: ReceiptId,
    claimant: AccountId,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    await this.database.claimReceipt(receiptId, claimant, context);
    appendClaim(chain.chainTransaction, this.deployments.current(), {
      receiptObjectId: await this.requireObjectId(receiptId, context),
      claimant: await this.addresses.resolve(claimant, context),
    });
    return chain.issueSettlementRef();
  }

  async burnReceipt(
    receiptId: ReceiptId,
    reason: BurnReason,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const chain = chainContextOf(context);
    await this.database.burnReceipt(receiptId, reason, context);
    const input = { receiptObjectId: await this.requireObjectId(receiptId, context) };
    if (reason === 'REDEMPTION') {
      appendBurnForRedemption(chain.chainTransaction, this.deployments.current(), input);
    } else {
      appendBurnForLiquidation(chain.chainTransaction, this.deployments.current(), input);
    }
    await this.rememberBurned(receiptId, chain, context);
    return chain.issueSettlementRef();
  }

  /* One custody operation on chain as well: the old object dies and the new
     one is shared in the same call, so the item is never without a title. */
  async reissueToBuyer(
    receiptId: ReceiptId,
    buyer: AccountId,
    context: UnitOfWorkContext,
  ): Promise<CustodyReceipt> {
    const chain = chainContextOf(context);
    const reissued = await this.database.reissueToBuyer(receiptId, buyer, context);
    appendReissueToBuyer(chain.chainTransaction, this.deployments.current(), {
      receiptObjectId: await this.requireObjectId(receiptId, context),
      newReceiptKey: reissued.id,
      buyer: await this.addresses.resolve(buyer, context),
    });
    await this.rememberBurned(receiptId, chain, context);
    await this.rememberIssued(reissued.id, chain, context);
    return reissued;
  }

  private async rememberIssued(
    receiptId: ReceiptId,
    chain: SuiUnitOfWorkContext,
    context: UnitOfWorkContext,
  ): Promise<void> {
    await transactionOf(context).chainReceipt.create({ data: { receiptId } });
    chain.onResolved(async (execution) => {
      const issued = eventOf(
        execution,
        'ReceiptIssued',
        (json) => textOfBytesField(json.receipt_key) === receiptId,
      );
      await transactionOf(context).chainReceipt.update({
        where: { receiptId },
        data: {
          objectId: stringFieldOf(issued.json, 'receipt_id'),
          issuedDigest: execution.digest,
        },
      });
    });
  }

  private async rememberBurned(
    receiptId: ReceiptId,
    chain: SuiUnitOfWorkContext,
    context: UnitOfWorkContext,
  ): Promise<void> {
    chain.onResolved(async (execution) => {
      await transactionOf(context).chainReceipt.update({
        where: { receiptId },
        data: { burnedDigest: execution.digest },
      });
    });
  }

  private async requireObjectId(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<string> {
    const row = await transactionOf(context).chainReceipt.findUnique({ where: { receiptId } });
    if (row === null || row.objectId === null) {
      throw new Error(`Receipt ${receiptId} has no object on chain`);
    }
    return row.objectId;
  }
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
