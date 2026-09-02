import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isChainDriverEnabled, loadConfiguration } from './configuration';

const variables = ['SETTLEMENT_DRIVER', 'CUSTODY_DRIVER'] as const;
const saved: Partial<Record<(typeof variables)[number], string | undefined>> = {};

describe('loadConfiguration drivers', () => {
  beforeEach(() => {
    for (const variable of variables) {
      saved[variable] = process.env[variable];
      delete process.env[variable];
    }
  });

  afterEach(() => {
    for (const variable of variables) {
      const value = saved[variable];
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
  });

  it('defaults both drivers to the phase one adapters', () => {
    const configuration = loadConfiguration();
    expect(configuration.settlementDriver).toBe('ledger');
    expect(configuration.custodyDriver).toBe('database');
    expect(isChainDriverEnabled(configuration)).toBe(false);
  });

  it('reads each driver from its own variable', () => {
    process.env.SETTLEMENT_DRIVER = 'chain';
    expect(loadConfiguration().settlementDriver).toBe('chain');
    expect(loadConfiguration().custodyDriver).toBe('database');

    process.env.SETTLEMENT_DRIVER = 'ledger';
    process.env.CUSTODY_DRIVER = 'chain';
    expect(loadConfiguration().settlementDriver).toBe('ledger');
    expect(loadConfiguration().custodyDriver).toBe('chain');
  });

  it('treats either driver on the chain as the chain being enabled', () => {
    process.env.CUSTODY_DRIVER = 'chain';
    expect(isChainDriverEnabled(loadConfiguration())).toBe(true);
  });

  it('refuses an unknown driver and names the variable', () => {
    process.env.SETTLEMENT_DRIVER = 'postgres';
    expect(() => loadConfiguration()).toThrow(/SETTLEMENT_DRIVER/);
  });
});
