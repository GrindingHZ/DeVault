import { Transaction } from '@mysten/sui/transactions';
import { describe, expect, it } from 'vitest';
import { demoParameters } from '../../parameters/demo-parameters';
import type { ChainDeployment } from '../chain-deployment';
import { appendAttest } from './attestation-calls';
import { appendPause, appendSetParameters, appendUnpause } from './config-calls';
import { appendEncumber, appendIssueReceipt, appendReissueToBuyer } from './custody-calls';
import {
  appendHold,
  appendMintAndDeposit,
  appendRefundHold,
  appendRelease,
  appendTransfer,
  appendWithdraw,
} from './escrow-calls';

const packageId = `0x${'a'.repeat(64)}`;
const deployment: ChainDeployment = {
  network: 'localnet',
  packageId,
  configId: `0x${'c'.repeat(64)}`,
  adminCapId: `0x${'1'.repeat(64)}`,
  operatorCapId: `0x${'2'.repeat(64)}`,
  custodianCapId: `0x${'3'.repeat(64)}`,
  treasuryCapId: `0x${'4'.repeat(64)}`,
  settlementCoinType: `${packageId}::usdc::USDC`,
  settlementCoinDecimals: 6,
  publishedAt: new Date(0),
  publishedBy: `0x${'0'.repeat(63)}e`,
};
const coinType = deployment.settlementCoinType;
const wallet = `0x${'5'.repeat(64)}`;
const otherWallet = `0x${'6'.repeat(64)}`;
const hold = `0x${'7'.repeat(64)}`;
const receipt = `0x${'8'.repeat(64)}`;
const member = `0x${'9'.repeat(64)}`;

interface Call {
  readonly module: string;
  readonly function: string;
  readonly typeArguments: readonly string[];
  readonly argumentCount: number;
}

function callsOf(transaction: Transaction): Call[] {
  return transaction.getData().commands.flatMap((command) =>
    command.MoveCall === undefined
      ? []
      : [
          {
            module: command.MoveCall.module,
            function: command.MoveCall.function,
            typeArguments: command.MoveCall.typeArguments,
            argumentCount: command.MoveCall.arguments.length,
          },
        ],
  );
}

describe('escrow builders', () => {
  it('holds from a wallet with the config for the pause check', () => {
    const transaction = new Transaction();
    appendHold(transaction, deployment, {
      coinType,
      walletId: wallet,
      holdKey: 'HOLD-1',
      amount: 60_000_000n,
      reference: 'LISTING-1',
    });
    expect(callsOf(transaction)).toEqual([
      { module: 'escrow', function: 'hold', typeArguments: [coinType], argumentCount: 6 },
    ]);
  });

  it('releases as begin, one pay per recipient in order, then finish', () => {
    const transaction = new Transaction();
    appendRelease(transaction, deployment, {
      coinType,
      holdObjectId: hold,
      reason: 'ORIGINATE_LOAN',
      payments: [
        { amount: 98_000_000n, to: { walletId: wallet } },
        { amount: 2_000_000n, to: { newOwner: member } },
      ],
    });
    expect(callsOf(transaction).map((call) => call.function)).toEqual([
      'begin_release',
      'pay',
      'pay_new',
      'finish_release',
    ]);
  });

  it('mints from the treasury before depositing on a local network', () => {
    const transaction = new Transaction();
    appendMintAndDeposit(transaction, deployment, {
      coinType,
      amount: 5_000_000n,
      to: { newOwner: member },
      reference: 'seed',
    });
    expect(callsOf(transaction).map((call) => `${call.module}::${call.function}`)).toEqual([
      'coin::mint',
      'escrow::deposit_new',
    ]);
  });

  it('refuses to mint where the operator holds no treasury', () => {
    const transaction = new Transaction();
    expect(() =>
      appendMintAndDeposit(
        transaction,
        { ...deployment, network: 'testnet', treasuryCapId: null },
        { coinType, amount: 1n, to: { walletId: wallet }, reference: 'seed' },
      ),
    ).toThrow(/testnet/);
  });

  it('transfers between wallets and opens one for a stranger', () => {
    const transaction = new Transaction();
    appendTransfer(transaction, deployment, {
      coinType,
      fromWalletId: wallet,
      to: { walletId: otherWallet },
      amount: 1n,
      reference: 'LOAN-1',
      reason: 'REPAY_LOAN',
    });
    appendTransfer(transaction, deployment, {
      coinType,
      fromWalletId: wallet,
      to: { newOwner: member },
      amount: 1n,
      reference: 'SALE-1',
      reason: 'SELL_NOTE',
    });
    appendRefundHold(transaction, deployment, { coinType, holdObjectId: hold, walletId: wallet });
    appendWithdraw(transaction, deployment, {
      coinType,
      walletId: wallet,
      amount: 1n,
      reference: 'W',
    });
    expect(callsOf(transaction).map((call) => call.function)).toEqual([
      'transfer',
      'transfer_new',
      'refund_hold',
      'withdraw',
    ]);
  });
});

describe('custody, config and attestation builders', () => {
  it('issues a receipt with the clock and the category code', () => {
    const transaction = new Transaction();
    appendIssueReceipt(transaction, deployment, {
      receiptKey: '01RECEIPT',
      vault: 'VAULT-1',
      holder: member,
      intakeHash: 'sha256:intake',
      appraisedValue: 5_000_000_000n,
      appraisedAtMs: 1_700_000_000_000n,
      itemCategory: 'WATCH',
      insuranceReference: 'POL-1',
    });
    appendEncumber(transaction, deployment, { receiptObjectId: receipt, loanKey: '01LOAN' });
    appendReissueToBuyer(transaction, deployment, {
      receiptObjectId: receipt,
      newReceiptKey: '02RECEIPT',
      buyer: member,
    });
    expect(callsOf(transaction)).toEqual([
      { module: 'custody', function: 'issue', typeArguments: [], argumentCount: 10 },
      { module: 'custody', function: 'encumber', typeArguments: [], argumentCount: 3 },
      { module: 'custody', function: 'reissue_to_buyer', typeArguments: [], argumentCount: 5 },
    ]);
  });

  it('pauses, unpauses, and writes parameters through a built struct', () => {
    const transaction = new Transaction();
    appendPause(transaction, deployment);
    appendUnpause(transaction, deployment);
    appendSetParameters(transaction, deployment, {
      parameters: demoParameters,
      effectiveAtMs: 1_700_000_000_000n,
    });
    expect(callsOf(transaction).map((call) => call.function)).toEqual([
      'pause',
      'unpause',
      'new_parameters',
      'set_parameters',
    ]);
  });

  it('attests an event with the operator capability and the clock', () => {
    const transaction = new Transaction();
    appendAttest(transaction, deployment, {
      subjectType: 'loan',
      subjectId: '01LOAN',
      eventType: 'LoanOriginated',
      payload: '{"loanId":"01LOAN"}',
    });
    expect(callsOf(transaction)).toEqual([
      { module: 'attestation', function: 'attest', typeArguments: [], argumentCount: 6 },
    ]);
  });
});
