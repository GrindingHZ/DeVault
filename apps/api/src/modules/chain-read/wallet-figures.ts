/* Turns a member's on-chain objects into their money, server side, because a
   full node no longer answers JSON-RPC from a browser. The api reads the chain
   over gRPC and derives the figures here. The arithmetic is the contract's own
   (interest.move): simple interest, pro-rated by elapsed time, clamped at
   maturity, truncating in the borrower's favour. Base units throughout, since
   the settlement coin has its own decimals, not the ledger's cents. */

const MILLISECONDS_PER_YEAR = 365n * 24n * 60n * 60n * 1000n;

export type PledgeStatus = 'open' | 'active' | 'repaid' | 'defaulted' | 'cancelled' | 'closed';

export function pledgeStatusOf(status: number): PledgeStatus {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'repaid';
    case 3:
      return 'defaulted';
    case 4:
      return 'cancelled';
    case 5:
      return 'closed';
    default:
      return 'open';
  }
}

export interface PledgeTerms {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly principalBaseUnits: bigint;
  readonly aprBps: number;
  readonly startedAtMs: number;
  readonly maturesAtMs: number;
  readonly gracePeriodMs: number;
  readonly parkedBaseUnits: bigint;
}

/* The part of the terms the interest arithmetic reads. */
export type InterestTerms = Pick<
  PledgeTerms,
  'principalBaseUnits' | 'aprBps' | 'startedAtMs' | 'maturesAtMs'
>;

export function accruedBaseUnits(terms: InterestTerms, untilMs: number): bigint {
  if (terms.aprBps <= 0) {
    return 0n;
  }
  const end = Math.min(untilMs, terms.maturesAtMs);
  const elapsedMs = Math.max(0, end - terms.startedAtMs);
  if (elapsedMs <= 0) {
    return 0n;
  }
  return (
    (terms.principalBaseUnits * BigInt(terms.aprBps) * BigInt(elapsedMs)) /
    (10_000n * MILLISECONDS_PER_YEAR)
  );
}

/* A payoff quote holds for this long. The chain reprices the payoff per
   millisecond at repayment, so the coin split to settle a loan is sized to the
   payoff as it will stand when the quote lapses, not as it stands now; the
   contract hands back whatever of that headroom it does not need. */
export const payoffQuoteWindowMs = 60_000;

export function payoffCoverBaseUnits(terms: InterestTerms, nowMs: number): bigint {
  return terms.principalBaseUnits + accruedBaseUnits(terms, nowMs + payoffQuoteWindowMs);
}

export interface LenderStanding {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly principalBaseUnits: bigint;
  readonly earnedSoFarBaseUnits: bigint;
  readonly valueAtMaturityBaseUnits: bigint;
  readonly collectableBaseUnits: bigint;
}

export function lenderStanding(terms: PledgeTerms, nowMs: number): LenderStanding {
  const active = terms.status === 'active';
  return {
    pledgeId: terms.pledgeId,
    status: terms.status,
    principalBaseUnits: active ? terms.principalBaseUnits : 0n,
    earnedSoFarBaseUnits: active ? accruedBaseUnits(terms, nowMs) : 0n,
    valueAtMaturityBaseUnits: active
      ? terms.principalBaseUnits + accruedBaseUnits(terms, terms.maturesAtMs)
      : 0n,
    collectableBaseUnits: terms.status === 'repaid' ? terms.parkedBaseUnits : 0n,
  };
}

export interface BorrowerStanding {
  readonly pledgeId: string;
  readonly status: PledgeStatus;
  readonly owedNowBaseUnits: bigint;
  readonly owedAtMaturityBaseUnits: bigint;
  readonly graceEndsAtMs: number;
}

export function borrowerStanding(terms: PledgeTerms, nowMs: number): BorrowerStanding {
  const active = terms.status === 'active';
  return {
    pledgeId: terms.pledgeId,
    status: terms.status,
    owedNowBaseUnits: active ? terms.principalBaseUnits + accruedBaseUnits(terms, nowMs) : 0n,
    owedAtMaturityBaseUnits: active
      ? terms.principalBaseUnits + accruedBaseUnits(terms, terms.maturesAtMs)
      : 0n,
    graceEndsAtMs: terms.maturesAtMs + terms.gracePeriodMs,
  };
}

export type HoldStatus = 'committed' | 'reclaimable' | 'consumed';

export function holdStatusOf(
  input: {
    readonly exists: boolean;
    readonly pledgeStatus: PledgeStatus | null;
    readonly expiresAtMs: number;
  },
  nowMs: number,
): HoldStatus {
  if (!input.exists) {
    return 'consumed';
  }
  if (input.pledgeStatus !== null && input.pledgeStatus !== 'open') {
    return 'reclaimable';
  }
  if (nowMs >= input.expiresAtMs) {
    return 'reclaimable';
  }
  return 'committed';
}

export interface OfferStanding {
  readonly holdObjectId: string;
  readonly pledgeId: string;
  readonly amountBaseUnits: bigint;
  readonly status: HoldStatus;
}

export function offerStanding(
  input: {
    readonly holdObjectId: string;
    readonly pledgeId: string;
    readonly amountBaseUnits: bigint;
    readonly exists: boolean;
    readonly pledgeStatus: PledgeStatus | null;
    readonly expiresAtMs: number;
  },
  nowMs: number,
): OfferStanding {
  return {
    holdObjectId: input.holdObjectId,
    pledgeId: input.pledgeId,
    amountBaseUnits: input.amountBaseUnits,
    status: holdStatusOf(input, nowMs),
  };
}

export interface WalletFigures {
  readonly availableBaseUnits: bigint;
  readonly lentPrincipalBaseUnits: bigint;
  readonly interestEarnedBaseUnits: bigint;
  readonly collectableBaseUnits: bigint;
  readonly owedNowBaseUnits: bigint;
  readonly committedBaseUnits: bigint;
  readonly reclaimableBaseUnits: bigint;
  readonly cashControlledBaseUnits: bigint;
  readonly activeBorrowCount: number;
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

export function summarizeFigures(input: {
  readonly availableBaseUnits: bigint;
  readonly lender: readonly LenderStanding[];
  readonly borrower: readonly BorrowerStanding[];
  readonly offers: readonly OfferStanding[];
}): WalletFigures {
  const collectable = sum(input.lender.map((standing) => standing.collectableBaseUnits));
  const committed = sum(
    input.offers
      .filter((offer) => offer.status === 'committed')
      .map((offer) => offer.amountBaseUnits),
  );
  const reclaimable = sum(
    input.offers
      .filter((offer) => offer.status === 'reclaimable')
      .map((offer) => offer.amountBaseUnits),
  );
  return {
    availableBaseUnits: input.availableBaseUnits,
    lentPrincipalBaseUnits: sum(input.lender.map((standing) => standing.principalBaseUnits)),
    interestEarnedBaseUnits: sum(input.lender.map((standing) => standing.earnedSoFarBaseUnits)),
    collectableBaseUnits: collectable,
    owedNowBaseUnits: sum(input.borrower.map((standing) => standing.owedNowBaseUnits)),
    committedBaseUnits: committed,
    reclaimableBaseUnits: reclaimable,
    cashControlledBaseUnits: input.availableBaseUnits + collectable + committed + reclaimable,
    activeBorrowCount: input.borrower.filter((standing) => standing.status === 'active').length,
  };
}

/* Parsers for the flat json a gRPC full node returns: the Move fields sit
   directly on the object, a u64 is a string, a u8 or u16 is a number, and a
   Balance renders as its value string. */
type Json = Record<string, unknown>;

function readU64(value: unknown): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return 0n;
}

export function pledgeTermsFromJson(pledgeId: string, json: Json | null): PledgeTerms | null {
  if (json === null) {
    return null;
  }
  return {
    pledgeId,
    status: pledgeStatusOf(Number(json.status ?? 0)),
    principalBaseUnits: readU64(json.principal),
    aprBps: Number(json.apr_bps ?? 0),
    startedAtMs: Number(readU64(json.started_at_ms)),
    maturesAtMs: Number(readU64(json.matures_at_ms)),
    gracePeriodMs: Number(readU64(json.grace_period_ms)),
    parkedBaseUnits: readU64(json.parked),
  };
}

export function notePledgeIdFromJson(json: Json | null): string | null {
  const pledgeId = json?.pledge_id;
  return typeof pledgeId === 'string' ? pledgeId : null;
}

export interface OfferEvent {
  readonly holdObjectId: string;
  readonly pledgeId: string;
  readonly amountBaseUnits: bigint;
  readonly aprBps: number;
}

export function offerFromEventJson(json: Json | null): OfferEvent | null {
  const holdObjectId = json?.hold_id;
  const pledgeId = json?.pledge_id;
  if (typeof holdObjectId !== 'string' || typeof pledgeId !== 'string') {
    return null;
  }
  return {
    holdObjectId,
    pledgeId,
    amountBaseUnits: readU64(json?.amount),
    aprBps: Number(json?.apr_bps ?? 0),
  };
}

export function holdExpiresAtFromJson(json: Json | null): number {
  return Number(readU64(json?.expires_at));
}

export interface WalletItem {
  readonly objectId: string;
  readonly appraisedValueBaseUnits: bigint;
  readonly itemCategory: string;
  readonly receiptKey: string;
  /* The custody record the receipt carries on chain: the vault it sits in, the
     hash of its intake, the policy insuring it, and when it was appraised and
     issued. Empty strings and zero when the shape did not carry them. */
  readonly vault: string;
  readonly intakeHash: string;
  readonly insuranceReference: string;
  readonly appraisedAtMs: number;
  readonly issuedAtMs: number;
}

/* The receipt_key is the api's own key for the receipt, stored on chain as the
   utf-8 bytes of the string, so a gRPC node hands it back base64; it is the key
   the off-chain name and photographs are filed under. */
function decodeReceiptKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = Buffer.from(value, 'base64').toString('utf8');
  return /^[\x20-\x7e]+$/.test(text) ? text : value;
}

/* The receipt stores its category as the u8 code custody.move was issued with,
   in the order the code assigns (BULLION 0 through ART 4), so the read names it
   back rather than showing a bare number or a generic word. */
const itemCategoryNames = ['BULLION', 'WATCH', 'JEWELLERY', 'COLLECTIBLE', 'ART'] as const;

function categoryNameOf(value: unknown): string {
  if (typeof value === 'number' && value >= 0 && value < itemCategoryNames.length) {
    return itemCategoryNames[value] ?? 'item';
  }
  if (typeof value === 'string') {
    return value;
  }
  return 'item';
}

export function itemFromJson(objectId: string, json: Json | null): WalletItem | null {
  if (json === null) {
    return null;
  }
  return {
    objectId,
    appraisedValueBaseUnits: readU64(json.appraised_value),
    itemCategory: categoryNameOf(json.item_category),
    receiptKey: decodeReceiptKey(json.receipt_key),
    vault: decodeReceiptKey(json.vault),
    intakeHash: decodeReceiptKey(json.intake_hash),
    insuranceReference: decodeReceiptKey(json.insurance_reference),
    appraisedAtMs: Number(readU64(json.appraised_at_ms)),
    issuedAtMs: Number(readU64(json.issued_at_ms)),
  };
}
