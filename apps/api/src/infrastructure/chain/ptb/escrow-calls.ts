import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { LedgerTransactionKind } from '../../../domain/ledger/ledger-transaction';
import type { ChainDeployment } from '../chain-deployment';
import { bytesOf, reasonCodes } from './codec';

/* A recipient either has a wallet object already or gets one opened in the
   same command; the adapter knows which from the wallet directory. */
export type WalletTarget = { readonly walletId: string } | { readonly newOwner: string };

interface EscrowInput {
  readonly coinType: string;
}

function target(deployment: ChainDeployment, name: string): string {
  return `${deployment.packageId}::escrow::${name}`;
}

export function appendOpenWallet(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & { readonly owner: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'open_wallet'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.pure.address(input.owner),
    ],
  });
}

/* Deposit by minting: the local stand in coin's treasury is the float. A
   public network has no treasury the operator holds, so the adapter pays a
   deposit from the operator's own wallet with `appendTransfer` instead. */
export function appendMintAndDeposit(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly baseUnits: bigint;
    readonly to: WalletTarget;
    readonly reference: string;
  },
): void {
  if (deployment.treasuryCapId === null) {
    throw new Error(`No treasury to mint from on ${deployment.network}`);
  }
  const coin = transaction.moveCall({
    target: '0x2::coin::mint',
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.treasuryCapId),
      transaction.pure.u64(input.baseUnits),
    ],
  });
  appendDepositOfCoin(transaction, deployment, { ...input, coin });
}

export function appendDepositOfCoin(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly coin: TransactionObjectArgument;
    readonly to: WalletTarget;
    readonly reference: string;
  },
): void {
  const reference = transaction.pure.vector('u8', bytesOf(input.reference));
  if ('walletId' in input.to) {
    transaction.moveCall({
      target: target(deployment, 'deposit'),
      typeArguments: [input.coinType],
      arguments: [transaction.object(input.to.walletId), input.coin, reference],
    });
    return;
  }
  transaction.moveCall({
    target: target(deployment, 'deposit_new'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.pure.address(input.to.newOwner),
      input.coin,
      reference,
    ],
  });
}

export function appendWithdraw(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly walletId: string;
    readonly baseUnits: bigint;
    readonly reference: string;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'withdraw'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.object(input.walletId),
      transaction.pure.u64(input.baseUnits),
      transaction.pure.vector('u8', bytesOf(input.reference)),
    ],
  });
}

export function appendHold(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly walletId: string;
    readonly holdKey: string;
    readonly baseUnits: bigint;
    readonly reference: string;
  },
): void {
  transaction.moveCall({
    target: target(deployment, 'hold'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.object(deployment.configId),
      transaction.object(input.walletId),
      transaction.pure.vector('u8', bytesOf(input.holdKey)),
      transaction.pure.u64(input.baseUnits),
      transaction.pure.vector('u8', bytesOf(input.reference)),
    ],
  });
}

export function appendRefundHold(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & { readonly holdObjectId: string; readonly walletId: string },
): void {
  transaction.moveCall({
    target: target(deployment, 'refund_hold'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.object(input.holdObjectId),
      transaction.object(input.walletId),
    ],
  });
}

export interface ReleasePayment {
  readonly baseUnits: bigint;
  readonly to: WalletTarget;
}

/* The waterfall as a sequence: begin, one pay per recipient in order, then
   finish, which aborts unless the hold is empty. The order of the payments
   is the order of the distribution the domain computed. */
export function appendRelease(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly holdObjectId: string;
    readonly reason: LedgerTransactionKind;
    readonly payments: readonly ReleasePayment[];
  },
): void {
  const payout = transaction.moveCall({
    target: target(deployment, 'begin_release'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.object(input.holdObjectId),
      transaction.pure.u8(reasonCodes[input.reason]),
    ],
  });
  for (const payment of input.payments) {
    if ('walletId' in payment.to) {
      transaction.moveCall({
        target: target(deployment, 'pay'),
        typeArguments: [input.coinType],
        arguments: [
          payout,
          transaction.object(payment.to.walletId),
          transaction.pure.u64(payment.baseUnits),
        ],
      });
    } else {
      transaction.moveCall({
        target: target(deployment, 'pay_new'),
        typeArguments: [input.coinType],
        arguments: [
          transaction.object(deployment.operatorCapId),
          payout,
          transaction.pure.address(payment.to.newOwner),
          transaction.pure.u64(payment.baseUnits),
        ],
      });
    }
  }
  transaction.moveCall({
    target: target(deployment, 'finish_release'),
    typeArguments: [input.coinType],
    arguments: [payout],
  });
}

export function appendTransfer(
  transaction: Transaction,
  deployment: ChainDeployment,
  input: EscrowInput & {
    readonly fromWalletId: string;
    readonly to: WalletTarget;
    readonly baseUnits: bigint;
    readonly reference: string;
    readonly reason: LedgerTransactionKind;
  },
): void {
  const amount = transaction.pure.u64(input.baseUnits);
  const reference = transaction.pure.vector('u8', bytesOf(input.reference));
  const reason = transaction.pure.u8(reasonCodes[input.reason]);
  if ('walletId' in input.to) {
    transaction.moveCall({
      target: target(deployment, 'transfer'),
      typeArguments: [input.coinType],
      arguments: [
        transaction.object(deployment.operatorCapId),
        transaction.object(input.fromWalletId),
        transaction.object(input.to.walletId),
        amount,
        reference,
        reason,
      ],
    });
    return;
  }
  transaction.moveCall({
    target: target(deployment, 'transfer_new'),
    typeArguments: [input.coinType],
    arguments: [
      transaction.object(deployment.operatorCapId),
      transaction.object(input.fromWalletId),
      transaction.pure.address(input.to.newOwner),
      amount,
      reference,
      reason,
    ],
  });
}
