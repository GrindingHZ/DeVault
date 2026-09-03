import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';
import { describe, expect, it } from 'vitest';
import type { ChainDeployment } from '../chain-deployment';
import { appendRedeem } from './custody-calls';
import { appendBuyPosition, appendDelistPosition, appendListPosition } from './market-calls';
import { appendMakeOffer, appendRefundExpired, appendRefundLosing } from './offer-calls';
import {
  appendAcceptOffer,
  appendCancelPledge,
  appendClaimDefault,
  appendCollect,
  appendOpenPledge,
  appendRepay,
} from './pledge-calls';

const packageId = `0x${'a'.repeat(64)}`;
const deployment: ChainDeployment = {
  network: 'testnet',
  packageId,
  configId: `0x${'c'.repeat(64)}`,
  adminCapId: `0x${'1'.repeat(64)}`,
  operatorCapId: `0x${'2'.repeat(64)}`,
  custodianCapId: `0x${'3'.repeat(64)}`,
  treasuryCapId: null,
  settlementCoinType: `${packageId}::usdc::USDC`,
  settlementCoinDecimals: 6,
  publishedAt: new Date(0),
  publishedBy: `0x${'0'.repeat(63)}e`,
};
const coinType = deployment.settlementCoinType;
const pledge = `0x${'5'.repeat(64)}`;
const hold = `0x${'6'.repeat(64)}`;
const receipt = `0x${'7'.repeat(64)}`;
const note = `0x${'8'.repeat(64)}`;
const listing = `0x${'9'.repeat(64)}`;

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

function coinArgument(transaction: Transaction): TransactionObjectArgument {
  const [coin] = transaction.splitCoins(transaction.gas, [1]);
  return coin;
}

describe('pledge builders', () => {
  it('opens and cancels a pledge over the settlement coin', () => {
    const transaction = new Transaction();
    appendOpenPledge(transaction, deployment, {
      receiptObjectId: receipt,
      requestedPrincipalBaseUnits: 500_000n,
      requestedAprBps: 3600,
    });
    appendCancelPledge(transaction, deployment, { pledgeObjectId: pledge });
    expect(callsOf(transaction)).toEqual([
      { module: 'pledge', function: 'open', typeArguments: [coinType], argumentCount: 4 },
      { module: 'pledge', function: 'cancel', typeArguments: [coinType], argumentCount: 1 },
    ]);
  });

  it('accepts an offer with the pledge, the hold, the config, the term and the clock', () => {
    const transaction = new Transaction();
    appendAcceptOffer(transaction, deployment, {
      pledgeObjectId: pledge,
      holdObjectId: hold,
      termMs: 2_592_000_000n,
    });
    expect(callsOf(transaction)).toEqual([
      { module: 'pledge', function: 'accept', typeArguments: [coinType], argumentCount: 5 },
    ]);
  });

  it('repays with the note and a coin, collects, and claims a default', () => {
    const transaction = new Transaction();
    appendRepay(transaction, deployment, {
      pledgeObjectId: pledge,
      borrowerNoteObjectId: note,
      payment: coinArgument(transaction),
    });
    appendCollect(transaction, deployment, { pledgeObjectId: pledge, lenderNoteObjectId: note });
    appendClaimDefault(transaction, deployment, {
      pledgeObjectId: pledge,
      lenderNoteObjectId: note,
    });
    expect(callsOf(transaction).map((call) => call.function)).toEqual([
      'repay',
      'collect',
      'claim_default',
    ]);
  });
});

describe('offer builders', () => {
  it('makes an offer against a pledge and refunds by expiry or loss', () => {
    const transaction = new Transaction();
    appendMakeOffer(transaction, deployment, {
      pledgeObjectId: pledge,
      holdKey: 'HOLD-1',
      payment: coinArgument(transaction),
      aprBps: 1800,
      expiresAtMs: 1_700_000_600_000n,
    });
    appendRefundExpired(transaction, deployment, { holdObjectId: hold });
    appendRefundLosing(transaction, deployment, { pledgeObjectId: pledge, holdObjectId: hold });
    expect(callsOf(transaction).map((call) => `${call.module}::${call.function}`)).toEqual([
      'pledge::offer',
      'escrow::refund_expired',
      'pledge::refund_losing',
    ]);
  });
});

describe('market and redemption builders', () => {
  it('lists, buys, and delists a position', () => {
    const transaction = new Transaction();
    appendListPosition(transaction, deployment, {
      lenderNoteObjectId: note,
      askBaseUnits: 4_100_000n,
    });
    appendBuyPosition(transaction, deployment, {
      listingObjectId: listing,
      payment: coinArgument(transaction),
    });
    appendDelistPosition(transaction, deployment, { listingObjectId: listing });
    expect(callsOf(transaction).map((call) => call.function)).toEqual([
      'list_position',
      'buy_position',
      'delist_position',
    ]);
  });

  it('redeems a receipt with a single argument and no capability', () => {
    const transaction = new Transaction();
    appendRedeem(transaction, deployment, { receiptObjectId: receipt });
    expect(callsOf(transaction)).toEqual([
      { module: 'custody', function: 'redeem', typeArguments: [], argumentCount: 1 },
    ]);
  });
});
