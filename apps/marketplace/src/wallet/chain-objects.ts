import { pledgeStatusOf } from './wallet-money';
import type { PledgeTerms } from './wallet-money';

/* Parsers for the object content a full node returns under `showContent`. A
   Move object arrives as `{ fields: { ... } }`, where a u64 is a string, a u8 or
   u16 is a number, an id is a hex string, and a `Balance` is a nested struct
   whose own `value` field is the amount. These read that shape defensively:
   anything malformed yields zero or null rather than a thrown render. */

type Fields = Record<string, unknown>;

interface MoveContent {
  readonly dataType?: string;
  readonly fields?: Fields;
}

export function fieldsOf(content: unknown): Fields | null {
  if (content !== null && typeof content === 'object') {
    const fields = (content as MoveContent).fields;
    if (fields !== undefined && fields !== null && typeof fields === 'object') {
      return fields as Fields;
    }
  }
  return null;
}

function readU64(value: unknown): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return 0n;
}

/* A `Balance<T>` renders as a struct `{ fields: { value } }`, though some nodes
   inline it as the value. Both are read. */
function readBalance(value: unknown): bigint {
  if (value !== null && typeof value === 'object') {
    const nested = fieldsOf(value);
    if (nested !== null && 'value' in nested) {
      return readU64(nested.value);
    }
    if ('value' in (value as Fields)) {
      return readU64((value as Fields).value);
    }
  }
  return readU64(value);
}

/* The pledge id a note points at, or null when the field is missing. */
export function notePledgeId(content: unknown): string | null {
  const fields = fieldsOf(content);
  const pledgeId = fields?.pledge_id;
  return typeof pledgeId === 'string' ? pledgeId : null;
}

export function pledgeTermsFrom(pledgeId: string, content: unknown): PledgeTerms | null {
  const fields = fieldsOf(content);
  if (fields === null) {
    return null;
  }
  return {
    pledgeId,
    status: pledgeStatusOf(Number(fields.status ?? 0)),
    principalBaseUnits: readU64(fields.principal),
    aprBps: Number(fields.apr_bps ?? 0),
    startedAtMs: Number(readU64(fields.started_at_ms)),
    maturesAtMs: Number(readU64(fields.matures_at_ms)),
    gracePeriodMs: Number(readU64(fields.grace_period_ms)),
    parkedBaseUnits: readBalance(fields.parked),
  };
}

export interface ReceiptSummary {
  readonly objectId: string;
  readonly appraisedValueBaseUnits: bigint;
  readonly itemCategory: string;
}

export function receiptSummaryFrom(objectId: string, content: unknown): ReceiptSummary | null {
  const fields = fieldsOf(content);
  if (fields === null) {
    return null;
  }
  return {
    objectId,
    appraisedValueBaseUnits: readU64(fields.appraised_value),
    itemCategory: typeof fields.item_category === 'string' ? fields.item_category : 'item',
  };
}
