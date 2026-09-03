import { describe, expect, it } from 'vitest';
import { buildReceiptPhotoUrl } from './receipt-photo-url';

describe('buildReceiptPhotoUrl', () => {
  /* This string is minted into the receipt on chain, so it has to be absolute:
     a wallet rendering the object has no origin of ours to resolve against. */
  it('addresses the photo route on the public origin', () => {
    expect(buildReceiptPhotoUrl('https://devault-marketplace.vercel.app', 'receipt-01ARZ3')).toBe(
      'https://devault-marketplace.vercel.app/api/v1/receipts/receipt-01ARZ3/photo',
    );
  });

  it('encodes a key that would otherwise break the path', () => {
    expect(buildReceiptPhotoUrl('https://devault.test', 'receipt 01/02')).toBe(
      'https://devault.test/api/v1/receipts/receipt%2001%2F02/photo',
    );
  });
});
