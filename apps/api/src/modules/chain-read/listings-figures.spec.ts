import { describe, expect, it } from 'vitest';
import { listingSeeds, openListingFromJson } from './listings-figures';

describe('listingSeeds', () => {
  it('collects pledge ids and their receipt keys, newest first and deduplicated', () => {
    const receiptKey = Buffer.from('receipt-3', 'utf8').toString('base64');
    expect(
      listingSeeds([
        { json: { pledge_id: '0xa', receipt_key: receiptKey } },
        { json: { pledge_id: '0xb', receipt_key: receiptKey } },
        { json: { pledge_id: '0xa', receipt_key: receiptKey } },
        { json: null },
      ]),
    ).toEqual([
      { pledgeId: '0xa', receiptKey: 'receipt-3' },
      { pledgeId: '0xb', receiptKey: 'receipt-3' },
    ]);
  });
});

describe('openListingFromJson', () => {
  it('reads an open pledge, its wrapped collateral, and carries the receipt key', () => {
    expect(
      openListingFromJson('0xp', 'receipt-9', {
        status: 0,
        borrower: '0xb',
        requested_principal: '2500000',
        requested_apr_bps: 1200,
        receipt: { appraised_value: '5000000', item_category: 1 },
      }),
    ).toEqual({
      pledgeId: '0xp',
      borrower: '0xb',
      requestedPrincipalBaseUnits: 2_500_000n,
      requestedAprBps: 1200,
      appraisedValueBaseUnits: 5_000_000n,
      itemCategory: 'WATCH',
      receiptKey: 'receipt-9',
    });
  });

  it('drops a pledge that is no longer open', () => {
    expect(
      openListingFromJson('0xp', 'receipt-9', {
        status: 1,
        borrower: '0xb',
        requested_apr_bps: 1200,
        receipt: null,
      }),
    ).toBeNull();
  });

  it('lists a pledge whose collateral shape carries no appraisal, priced by rate alone', () => {
    expect(
      openListingFromJson('0xp', 'receipt-9', {
        status: 0,
        borrower: '0xb',
        requested_apr_bps: 900,
        receipt: null,
      }),
    ).toEqual({
      pledgeId: '0xp',
      borrower: '0xb',
      requestedPrincipalBaseUnits: 0n,
      requestedAprBps: 900,
      appraisedValueBaseUnits: 0n,
      itemCategory: 'item',
      receiptKey: 'receipt-9',
    });
  });
});
