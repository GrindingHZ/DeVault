/* Turns the chain's open pledges into the listings a lender browses. A borrower
   signs pledge::open to wrap a receipt and name the rate they want, which shares
   a Pledge object in the OPEN state and emits ListingOpened. There is no way to
   list shared objects of a type by owner, so the pledge ids come from the
   events and the current state comes from reading each object back: a pledge a
   later offer took is no longer OPEN and drops out. */

const OPEN_STATUS = 0;

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

function readU64(value: unknown): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return 0n;
}

export interface OpenListing {
  readonly pledgeId: string;
  readonly borrower: string;
  readonly requestedPrincipalBaseUnits: bigint;
  readonly requestedAprBps: number;
  readonly appraisedValueBaseUnits: bigint;
  readonly itemCategory: string;
  readonly receiptKey: string;
}

type Json = Record<string, unknown>;

/* The receipt_key rides on the event as base64 bytes; it is the key the item's
   name and photographs are filed under, so a lender browsing a listing can see
   the same picture the borrower registered. */
function decodeReceiptKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = Buffer.from(value, 'base64').toString('utf8');
  return /^[\x20-\x7e]+$/.test(text) ? text : value;
}

export interface ListingSeed {
  readonly pledgeId: string;
  readonly receiptKey: string;
}

/* The pledge ids ListingOpened has ever named with the receipt key each carries,
   newest first, deduplicated: the discovery set the current reads are filtered
   down from. */
export function listingSeeds(events: readonly { readonly json: Json | null }[]): ListingSeed[] {
  const seeds: ListingSeed[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const pledgeId = event.json?.pledge_id;
    if (typeof pledgeId === 'string' && !seen.has(pledgeId)) {
      seen.add(pledgeId);
      seeds.push({ pledgeId, receiptKey: decodeReceiptKey(event.json?.receipt_key) });
    }
  }
  return seeds;
}

/* The wrapped receipt is an Option<VaultReceipt> the node renders as the nested
   object while the pledge is open, so its appraisal is read from there; a shape
   that does not carry it still lists, priced by rate alone. */
export function openListingFromJson(
  pledgeId: string,
  receiptKey: string,
  json: Json | null,
): OpenListing | null {
  if (json === null || Number(json.status ?? -1) !== OPEN_STATUS) {
    return null;
  }
  const borrower = json.borrower;
  if (typeof borrower !== 'string') {
    return null;
  }
  const receipt = json.receipt;
  const receiptJson = receipt !== null && typeof receipt === 'object' ? (receipt as Json) : null;
  return {
    pledgeId,
    borrower,
    requestedPrincipalBaseUnits: readU64(json.requested_principal),
    requestedAprBps: Number(json.requested_apr_bps ?? 0),
    appraisedValueBaseUnits: readU64(receiptJson?.appraised_value),
    itemCategory: categoryNameOf(receiptJson?.item_category),
    receiptKey,
  };
}
