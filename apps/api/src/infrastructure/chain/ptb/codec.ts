import type { ItemCategory } from '../../../domain/custody/item-category';
import type { LedgerTransactionKind } from '../../../domain/ledger/ledger-transaction';
import type { Currency, Money } from '../../../domain/shared/money';
import type { ChainDeployment } from '../chain-deployment';

/* The api's single currency and its cent precision, against which the
   settlement coin's decimals are scaled. Widening to more currencies is a
   map here and a column on the deployment (docs/00-product-overview.md
   non-goals). */
const apiCurrency = 'USD';
const apiDecimals = 2;

/* Category codes in the order of item-category.ts, which is also the order
   of the loan to value vector in the chain config. */
export const itemCategoryCodes: Readonly<Record<ItemCategory, number>> = {
  BULLION: 0,
  WATCH: 1,
  JEWELLERY: 2,
  COLLECTIBLE: 3,
  ART: 4,
};

/* Reason codes in the order of the Prisma LedgerTransactionKind enum, so a
   chain event and a ledger row name the same movement the same way. */
export const reasonCodes: Readonly<Record<LedgerTransactionKind, number>> = {
  DEPOSIT: 0,
  HOLD_FUNDS: 1,
  REFUND_HOLD: 2,
  ORIGINATE_LOAN: 3,
  REPAY_LOAN: 4,
  SELL_NOTE: 5,
  SETTLE_LIQUIDATION: 6,
  WITHDRAW: 7,
};

export function bytesOf(text: string): number[] {
  return [...Buffer.from(text, 'utf8')];
}

export function textOf(bytes: readonly number[]): string {
  return Buffer.from(bytes).toString('utf8');
}

export function coinTypeFor(currency: Currency, deployment: ChainDeployment): string {
  if (currency !== apiCurrency) {
    throw new Error(`No settlement coin is deployed for ${currency}`);
  }
  return deployment.settlementCoinType;
}

function scaleFor(deployment: ChainDeployment): bigint {
  if (deployment.settlementCoinDecimals < apiDecimals) {
    throw new Error(
      `A settlement coin with ${deployment.settlementCoinDecimals} decimals cannot carry cents`,
    );
  }
  return 10n ** BigInt(deployment.settlementCoinDecimals - apiDecimals);
}

/* One cent is exactly ten thousand USDC base units, so the scale never
   rounds in either direction. */
export function chainAmountOf(money: Money, deployment: ChainDeployment): bigint {
  coinTypeFor(money.currency, deployment);
  return money.minorUnits * scaleFor(deployment);
}

export function minorUnitsOf(chainAmount: bigint, deployment: ChainDeployment): bigint {
  const scale = scaleFor(deployment);
  if (chainAmount % scale !== 0n) {
    throw new Error(`${chainAmount} base units do not divide into whole minor units`);
  }
  return chainAmount / scale;
}

/* A `vector<u8>` field comes back from the node as base64 in event JSON and
   as a byte array from other readers; both mean the same text. */
export function textOfBytesField(value: unknown): string {
  if (typeof value === 'string') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return Buffer.from(value as number[]).toString('utf8');
  }
  throw new Error(`A bytes field was neither base64 nor a byte array: ${JSON.stringify(value)}`);
}

export function stringFieldOf(json: Readonly<Record<string, unknown>>, field: string): string {
  const value = json[field];
  if (typeof value !== 'string') {
    throw new Error(`The event carries no string ${field}: ${JSON.stringify(json)}`);
  }
  return value;
}

export function bigintFieldOf(json: Readonly<Record<string, unknown>>, field: string): bigint {
  const value = json[field];
  if (typeof value === 'string' || typeof value === 'number') {
    return BigInt(value);
  }
  throw new Error(`The event carries no numeric ${field}: ${JSON.stringify(json)}`);
}
