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
        receipt: { id: '0xr', appraised_value: '5000000', item_category: 1 },
      }),
    ).toEqual({
      pledgeId: '0xp',
      borrower: '0xb',
      requestedPrincipalBaseUnits: 2_500_000n,
      requestedAprBps: 1200,
      appraisedValueBaseUnits: 5_000_000n,
      itemCategory: 'WATCH',
      receiptKey: 'receipt-9',
      receiptObjectId: '0xr',
    });
  });

  /* The node renders a UID either as the bare address or as the struct that
     holds it, depending on the layout it was asked for. The receipt object is
     the one a reader follows to the explorer, so both spellings have to land. */
  it('reads the wrapped receipt object id however the node spells the uid', () => {
    const listing = openListingFromJson('0xp', 'receipt-9', {
      status: 0,
      borrower: '0xb',
      requested_apr_bps: 1200,
      receipt: { id: { id: '0xr' }, appraised_value: '5000000', item_category: 1 },
    });
    expect(listing?.receiptObjectId).toBe('0xr');
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
      receiptObjectId: null,
    });
  });
});
