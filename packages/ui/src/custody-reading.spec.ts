import { describe, expect, it } from 'vitest';
import { custodyReadingFor, redemptionStepIndex, redemptionSteps } from './custody-reading';

describe('reading custody from both state machines at once', () => {
  it('names an unencumbered item as the reader can act on it', () => {
    const reading = custodyReadingFor('IN_VAULT', null);
    expect(reading.label).toBe('In the vault');
    expect(reading.tone).toBe('active');
  });

  it('warns while a loan is standing against the item', () => {
    const reading = custodyReadingFor('ENCUMBERED', null);
    expect(reading.label).toBe('Securing a loan');
    expect(reading.tone).toBe('warning');
  });

  /* The defect this function exists for. Asking for an item back burns the
     receipt immediately, so a screen reading the receipt alone announces the
     item collected while it is still on the shelf. */
  it('does not claim an item is collected while it is still in the vault', () => {
    const requested = custodyReadingFor('RELEASED', 'REQUESTED');
    expect(requested.label).toBe('Collection requested');
    expect(requested.detail).toContain('Still in the vault');

    const verified = custodyReadingFor('RELEASED', 'VERIFIED');
    expect(verified.label).toBe('Identity verified');
    expect(verified.detail).toContain('Still in the vault');
  });

  it('says the item has gone only once it has actually gone', () => {
    const reading = custodyReadingFor('RELEASED', 'RELEASED');
    expect(reading.label).toBe('Handed over');
    expect(reading.tone).toBe('neutral');
  });

  it('falls back to the receipt alone when no redemption was recorded', () => {
    expect(custodyReadingFor('RELEASED', null).label).toBe('Collected');
  });

  it('marks a sold item as the loss it is', () => {
    const reading = custodyReadingFor('LIQUIDATED', null);
    expect(reading.label).toBe('Sold');
    expect(reading.tone).toBe('danger');
  });

  /* An unknown status must still render something a person can report,
     rather than an empty badge. */
  it('answers for a status it has never seen', () => {
    const reading = custodyReadingFor('SOMETHING_NEW', null);
    expect(reading.label).not.toBe('');
    expect(reading.detail).not.toBe('');
  });

  it('places a redemption on its own track', () => {
    expect(redemptionSteps).toHaveLength(3);
    expect(redemptionStepIndex('REQUESTED')).toBe(0);
    expect(redemptionStepIndex('VERIFIED')).toBe(1);
    expect(redemptionStepIndex('RELEASED')).toBe(2);
  });
});
