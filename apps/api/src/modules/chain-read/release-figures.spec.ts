import { describe, expect, it } from 'vitest';
import { redemptionEventsToQueue } from './release-figures';

describe('redemptionEventsToQueue', () => {
  it('names the receipt, decodes the key, and reads the holder from the sender', () => {
    const receiptKey = Buffer.from('receipt-42', 'utf8').toString('base64');
    const queue = redemptionEventsToQueue([
      {
        transactionDigest: '0xdigest',
        sender: '0xholder',
        json: { receipt_id: '0xreceipt', receipt_key: receiptKey },
      },
    ]);
    expect(queue).toEqual([
      { digest: '0xdigest', receiptId: '0xreceipt', receiptKey: 'receipt-42', holder: '0xholder' },
    ]);
  });

  it('skips an event with no receipt id and keeps a non-text key as given', () => {
    const queue = redemptionEventsToQueue([
      { transactionDigest: '0xa', sender: '0xs', json: null },
      { transactionDigest: '0xb', sender: '0xs', json: { receipt_id: '0xr', receipt_key: 42 } },
    ]);
    expect(queue).toEqual([{ digest: '0xb', receiptId: '0xr', receiptKey: '', holder: '0xs' }]);
  });
});
