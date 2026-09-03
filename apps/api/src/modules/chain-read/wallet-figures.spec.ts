import { describe, expect, it } from 'vitest';
import {
  borrowerStanding,
  holdStatusOf,
  itemFromJson,
  lenderStanding,
  offerFromEventJson,
  offerStanding,
  pledgeStatusOf,
  pledgeTermsFromJson,
  summarizeFigures,
} from './wallet-figures';
import type { PledgeTerms } from './wallet-figures';

const day = 24 * 60 * 60 * 1000;
const started = 1_700_000_000_000;
const matures = started + 30 * day;
const yearMs = 365n * 24n * 60n * 60n * 1000n;

function expectedAccrued(principal: bigint, aprBps: number, elapsedMs: number): bigint {
  return (principal * BigInt(aprBps) * BigInt(elapsedMs)) / (10_000n * yearMs);
}

function terms(overrides: Partial<PledgeTerms> = {}): PledgeTerms {
  return {
    pledgeId: '0xp',
    status: 'active',
    principalBaseUnits: 1_000_000_000n,
    aprBps: 3600,
    startedAtMs: started,
    maturesAtMs: matures,
    gracePeriodMs: 7 * day,
    parkedBaseUnits: 0n,
    ...overrides,
  };
}

describe('pledgeStatusOf', () => {
  it('names the status byte', () => {
    expect(pledgeStatusOf(0)).toBe('open');
    expect(pledgeStatusOf(1)).toBe('active');
    expect(pledgeStatusOf(2)).toBe('repaid');
    expect(pledgeStatusOf(3)).toBe('defaulted');
  });
});

describe('lenderStanding', () => {
  it('accrues on an active loan and clamps at maturity', () => {
    const now = started + 10 * day;
    const standing = lenderStanding(terms(), now);
    expect(standing.earnedSoFarBaseUnits).toBe(expectedAccrued(1_000_000_000n, 3600, 10 * day));
    expect(standing.valueAtMaturityBaseUnits).toBe(
      1_000_000_000n + expectedAccrued(1_000_000_000n, 3600, 30 * day),
    );
    const late = lenderStanding(terms(), matures + 50 * day);
    expect(late.earnedSoFarBaseUnits).toBe(expectedAccrued(1_000_000_000n, 3600, 30 * day));
  });

  it('reports parked as collectable once repaid', () => {
    const standing = lenderStanding(terms({ status: 'repaid', parkedBaseUnits: 42n }), matures);
    expect(standing.collectableBaseUnits).toBe(42n);
    expect(standing.principalBaseUnits).toBe(0n);
  });
});

describe('borrowerStanding', () => {
  it('owes principal plus interest and knows the grace cliff', () => {
    const now = started + 10 * day;
    const standing = borrowerStanding(terms(), now);
    expect(standing.owedNowBaseUnits).toBe(
      1_000_000_000n + expectedAccrued(1_000_000_000n, 3600, 10 * day),
    );
    expect(standing.graceEndsAtMs).toBe(matures + 7 * day);
  });
});

describe('holdStatusOf', () => {
  const now = started + 5 * day;
  it('reads committed, reclaimable and consumed', () => {
    expect(holdStatusOf({ exists: true, pledgeStatus: 'open', expiresAtMs: now + day }, now)).toBe(
      'committed',
    );
    expect(
      holdStatusOf({ exists: true, pledgeStatus: 'active', expiresAtMs: now + day }, now),
    ).toBe('reclaimable');
    expect(holdStatusOf({ exists: true, pledgeStatus: 'open', expiresAtMs: now - day }, now)).toBe(
      'reclaimable',
    );
    expect(holdStatusOf({ exists: false, pledgeStatus: 'open', expiresAtMs: now + day }, now)).toBe(
      'consumed',
    );
  });
});

describe('summarizeFigures', () => {
  it('sums the bands and counts controlled cash', () => {
    const now = started + 10 * day;
    const figures = summarizeFigures({
      availableBaseUnits: 500n,
      lender: [
        lenderStanding(terms({ pledgeId: '0xa' }), now),
        lenderStanding(terms({ pledgeId: '0xb', status: 'repaid', parkedBaseUnits: 200n }), now),
      ],
      borrower: [borrowerStanding(terms({ pledgeId: '0xc' }), now)],
      offers: [
        offerStanding(
          {
            holdObjectId: '0xs',
            pledgeId: '0xd',
            amountBaseUnits: 400n,
            exists: true,
            pledgeStatus: 'open',
            expiresAtMs: now + day,
          },
          now,
        ),
        offerStanding(
          {
            holdObjectId: '0xl',
            pledgeId: '0xe',
            amountBaseUnits: 300n,
            exists: true,
            pledgeStatus: 'active',
            expiresAtMs: now + day,
          },
          now,
        ),
        offerStanding(
          {
            holdObjectId: '0xg',
            pledgeId: '0xf',
            amountBaseUnits: 999n,
            exists: false,
            pledgeStatus: 'open',
            expiresAtMs: now + day,
          },
          now,
        ),
      ],
    });
    expect(figures.collectableBaseUnits).toBe(200n);
    expect(figures.committedBaseUnits).toBe(400n);
    expect(figures.reclaimableBaseUnits).toBe(300n);
    expect(figures.cashControlledBaseUnits).toBe(1400n);
    expect(figures.activeBorrowCount).toBe(1);
  });
});

describe('gRPC json parsers', () => {
  it('reads a pledge from flat json, with the parked balance as a value', () => {
    const parsed = pledgeTermsFromJson('0xp', {
      status: 2,
      principal: '1000000000',
      apr_bps: 3600,
      started_at_ms: '1700000000000',
      matures_at_ms: '1702592000000',
      grace_period_ms: '604800000',
      parked: '1029589041',
    });
    expect(parsed?.status).toBe('repaid');
    expect(parsed?.principalBaseUnits).toBe(1_000_000_000n);
    expect(parsed?.parkedBaseUnits).toBe(1_029_589_041n);
  });

  it('reads an OfferMade event and a receipt', () => {
    expect(
      offerFromEventJson({ amount: '400000', hold_id: '0xh', owner: '0xo', pledge_id: '0xpl' }),
    ).toEqual({ holdObjectId: '0xh', pledgeId: '0xpl', amountBaseUnits: 400_000n });
    const receiptKey = Buffer.from('receipt-7', 'utf8').toString('base64');
    expect(
      itemFromJson('0xr', {
        appraised_value: '800000000',
        item_category: 'BULLION',
        receipt_key: receiptKey,
      }),
    ).toEqual({
      objectId: '0xr',
      appraisedValueBaseUnits: 800_000_000n,
      itemCategory: 'BULLION',
      receiptKey: 'receipt-7',
    });
    /* On chain the category is the u8 code, not the name. */
    expect(itemFromJson('0xr', { appraised_value: '1', item_category: 1 })?.itemCategory).toBe(
      'WATCH',
    );
  });
});
