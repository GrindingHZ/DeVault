/* Turns the chain's RedemptionRequested events into the release queue staff work
   from. A member signs custody::redeem to burn their receipt, giving up the
   claim; the event names the receipt and the transaction the burn happened in,
   and its sender is the member now waiting at the counter. The receipt_key is
   the api's own receipt id, stored on chain as the utf-8 bytes of the string, so
   a gRPC full node hands it back base64 and this decodes it to what the api
   named. */

export interface RedemptionEvent {
  readonly transactionDigest: string;
  readonly sender: string;
  readonly json: Record<string, unknown> | null;
}

export interface ReleaseQueueItem {
  readonly digest: string;
  readonly receiptId: string;
  readonly receiptKey: string;
  readonly holder: string;
}

function decodeReceiptKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = Buffer.from(value, 'base64').toString('utf8');
  /* A round trip to printable ascii means the base64 really was a utf-8 string,
     the shape issue writes; anything else is left as the node handed it. */
  return /^[\x20-\x7e]+$/.test(text) ? text : value;
}

export function redemptionEventsToQueue(events: readonly RedemptionEvent[]): ReleaseQueueItem[] {
  const queue: ReleaseQueueItem[] = [];
  for (const event of events) {
    const json = event.json ?? {};
    const receiptId = json.receipt_id;
    if (typeof receiptId !== 'string') {
      continue;
    }
    queue.push({
      digest: event.transactionDigest,
      receiptId,
      receiptKey: decodeReceiptKey(json.receipt_key),
      holder: event.sender,
    });
  }
  return queue;
}
