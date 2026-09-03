/* Shared plumbing for turning the chain's flat gRPC json into the money dtos
   the restored web2 ui speaks. Kept in one place so every /me read scales
   amounts and decodes keys the same way. */

export interface Json {
  [key: string]: unknown;
}

/* A gRPC object entry that is live: a deleted object comes back as
   `{ code: 'notExists', objectId }`, which the `code` guard rejects. */
export function objectEntry(entry: unknown): { objectId: string; json: Json | null } | null {
  if (entry !== null && typeof entry === 'object' && !(entry instanceof Error)) {
    const record = entry as { objectId?: unknown; json?: unknown; code?: unknown };
    if (typeof record.objectId === 'string' && record.code === undefined) {
      const json = record.json;
      return {
        objectId: record.objectId,
        json: json === null || json === undefined ? null : (json as Json),
      };
    }
  }
  return null;
}

/* Base units to the money dto's cents. The settlement coin carries its own
   decimals; the dto's minor units are hundredths, so the tail decimals are
   dropped. Currency is the single supported one. */
export function toMoneyDto(
  baseUnits: bigint,
  decimals: number,
): { minorUnits: string; currency: string } {
  const scale = 10n ** BigInt(Math.max(0, decimals - 2));
  return { minorUnits: (baseUnits / scale).toString(), currency: 'USD' };
}

export function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

/* A vector<u8> the node hands back base64, decoded to its string when it is
   printable ascii, which is how receipt keys and vault ids were written. */
export function decodeBytes(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = Buffer.from(value, 'base64').toString('utf8');
  return /^[\x20-\x7e]+$/.test(text) ? text : '';
}

/* The receipt key of the receipt a pledge wraps, when it still holds one. */
export function receiptKeyOf(pledgeJson: Json | null): string {
  const receipt = pledgeJson?.receipt;
  const key =
    receipt !== null && typeof receipt === 'object' ? (receipt as Json).receipt_key : undefined;
  return decodeBytes(key);
}
