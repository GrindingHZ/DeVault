import { describe, expect, it } from 'vitest';
import { listingPledgeIds, openListingFromJson } from './listings-figures';

describe('listingPledgeIds', () => {
  it('collects pledge ids from events, newest first and deduplicated', () => {
    expect(
      listingPledgeIds([
        { json: { pledge_id: '0xa' } },
        { json: { pledge_id: '0xb' } },
        { json: { pledge_id: '0xa' } },
        { json: null },
      ]),
    ).toEqual(['0xa', '0xb']);
  });
});

describe('openListingFromJson', () => {
  it('reads an open pledge and its wrapped collateral', () => {
    expect(
      openListingFromJson('0xp', {
        status: 0,
        borrower: '0xb',
        requested_apr_bps: 1200,
        receipt: { appraised_value: '5000000', item_category: 1 },
      }),
    ).toEqual({
      pledgeId: '0xp',
      borrower: '0xb',
      requestedAprBps: 1200,
      appraisedValueBaseUnits: 5_000_000n,
      itemCategory: 'WATCH',
    });
  });

  it('drops a pledge that is no longer open', () => {
    expect(
      openListingFromJson('0xp', { status: 1, borrower: '0xb', requested_apr_bps: 1200, receipt: null }),
    ).toBeNull();
  });

  it('lists a pledge whose collateral shape carries no appraisal, priced by rate alone', () => {
    expect(
      openListingFromJson('0xp', { status: 0, borrower: '0xb', requested_apr_bps: 900, receipt: null }),
    ).toEqual({
      pledgeId: '0xp',
      borrower: '0xb',
      requestedAprBps: 900,
      appraisedValueBaseUnits: 0n,
      itemCategory: 'item',
    });
  });
});
