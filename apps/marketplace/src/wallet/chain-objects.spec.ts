import { describe, expect, it } from 'vitest';
import { notePledgeId, pledgeTermsFrom, receiptSummaryFrom } from './chain-objects';

/* Shaped like a full node's showContent: u64 as string, u8 and u16 as number,
   an id as a hex string, a Balance as a nested struct. */
const pledgeContent = {
  dataType: 'moveObject',
  type: '0xpkg::pledge::Pledge<0xpkg::usdc::USDC>',
  fields: {
    status: 1,
    principal: '1000000000',
    apr_bps: 3600,
    started_at_ms: '1700000000000',
    matures_at_ms: '1702592000000',
    grace_period_ms: '604800000',
    parked: { type: '0x2::balance::Balance<0xpkg::usdc::USDC>', fields: { value: '0' } },
  },
};

describe('pledgeTermsFrom', () => {
  it('parses the pledge fields, reading the parked balance struct', () => {
    const terms = pledgeTermsFrom('0xpledge', pledgeContent);
    expect(terms).not.toBeNull();
    expect(terms?.status).toBe('active');
    expect(terms?.principalBaseUnits).toBe(1_000_000_000n);
    expect(terms?.aprBps).toBe(3600);
    expect(terms?.startedAtMs).toBe(1_700_000_000_000);
    expect(terms?.maturesAtMs).toBe(1_702_592_000_000);
    expect(terms?.gracePeriodMs).toBe(604_800_000);
    expect(terms?.parkedBaseUnits).toBe(0n);
  });

  it('reads a repaid pledge with a parked payoff', () => {
    const terms = pledgeTermsFrom('0xpledge', {
      fields: { ...pledgeContent.fields, status: 2, parked: { fields: { value: '1029589041' } } },
    });
    expect(terms?.status).toBe('repaid');
    expect(terms?.parkedBaseUnits).toBe(1_029_589_041n);
  });

  it('returns null for content with no fields', () => {
    expect(pledgeTermsFrom('0xpledge', null)).toBeNull();
    expect(pledgeTermsFrom('0xpledge', { dataType: 'package' })).toBeNull();
  });
});

describe('notePledgeId', () => {
  it('reads the pledge id a note points at', () => {
    expect(notePledgeId({ fields: { pledge_id: '0xpledge', principal: '5' } })).toBe('0xpledge');
    expect(notePledgeId({ fields: { principal: '5' } })).toBeNull();
    expect(notePledgeId(null)).toBeNull();
  });
});

describe('receiptSummaryFrom', () => {
  it('reads the appraised value and category', () => {
    const summary = receiptSummaryFrom('0xreceipt', {
      fields: { appraised_value: '800000000', item_category: 'BULLION' },
    });
    expect(summary).toEqual({
      objectId: '0xreceipt',
      appraisedValueBaseUnits: 800_000_000n,
      itemCategory: 'BULLION',
    });
  });
});
