import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ChainConfigurationMissing,
  loadChainConfiguration,
  readVerificationNetworks,
} from './chain-configuration';

const variables = [
  'SUI_NETWORK',
  'SUI_GRPC_URL',
  'SUI_FAUCET_URL',
  'SUI_OPERATOR_SECRET_KEY',
  'SUI_ACCOUNT_SEED',
  'WALLET_VERIFY_NETWORKS',
] as const;
const saved: Partial<Record<(typeof variables)[number], string | undefined>> = {};

describe('loadChainConfiguration', () => {
  beforeEach(() => {
    for (const variable of variables) {
      saved[variable] = process.env[variable];
      delete process.env[variable];
    }
    process.env.SUI_OPERATOR_SECRET_KEY = 'suiprivkey1test';
    process.env.SUI_ACCOUNT_SEED = 'ab'.repeat(32);
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

  it('defaults to the public test network, which has no faucet', () => {
    const configuration = loadChainConfiguration();
    expect(configuration.network).toBe('testnet');
    expect(configuration.grpcUrl).toBe('https://fullnode.testnet.sui.io:443');
    expect(configuration.faucetUrl).toBeNull();
  });

  it('still knows the local network and its faucet', () => {
    process.env.SUI_NETWORK = 'localnet';
    const configuration = loadChainConfiguration();
    expect(configuration.network).toBe('localnet');
    expect(configuration.grpcUrl).toBe('http://127.0.0.1:9000');
    expect(configuration.faucetUrl).toBe('http://127.0.0.1:9123');
  });

  it('lets an explicit endpoint and an emptied faucet override the defaults', () => {
    process.env.SUI_GRPC_URL = 'http://sui:9000';
    process.env.SUI_FAUCET_URL = '';
    const configuration = loadChainConfiguration();
    expect(configuration.grpcUrl).toBe('http://sui:9000');
    expect(configuration.faucetUrl).toBeNull();
  });

  it('names the first missing variable', () => {
    delete process.env.SUI_ACCOUNT_SEED;
    expect(() => loadChainConfiguration()).toThrow(ChainConfigurationMissing);
    expect(() => loadChainConfiguration()).toThrow(/SUI_ACCOUNT_SEED/);
  });

  it('refuses an unknown network', () => {
    process.env.SUI_NETWORK = 'devnet';
    expect(() => loadChainConfiguration()).toThrow(/SUI_NETWORK/);
  });
});

/* A zkLogin proof only verifies on the network that produced it: the proof
   commits to a maxEpoch, and mainnet and testnet count epochs separately. A
   member whose wallet sits on mainnet must still be able to prove they hold
   their address, so sign in checks more than the one network we settle on. */
describe('readVerificationNetworks', () => {
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

  it('checks the settled network first, so the common case costs one call', () => {
    process.env.SUI_NETWORK = 'testnet';
    expect(readVerificationNetworks().map((endpoint) => endpoint.network)).toEqual([
      'testnet',
      'mainnet',
    ]);
  });

  it('still reaches testnet for a deployment that settles on mainnet', () => {
    process.env.SUI_NETWORK = 'mainnet';
    expect(readVerificationNetworks().map((endpoint) => endpoint.network)).toEqual([
      'mainnet',
      'testnet',
    ]);
  });

  /* A deployed api must never dial 127.0.0.1 on a stranger's say so, so
     localnet is reachable only by a process already pointed at one. */
  it('offers localnet only to a process that settles on localnet', () => {
    process.env.SUI_NETWORK = 'localnet';
    const networks = readVerificationNetworks().map((endpoint) => endpoint.network);
    expect(networks[0]).toBe('localnet');

    process.env.SUI_NETWORK = 'testnet';
    expect(readVerificationNetworks().map((endpoint) => endpoint.network)).not.toContain(
      'localnet',
    );
  });

  it('takes an explicit list when one is given', () => {
    process.env.SUI_NETWORK = 'testnet';
    process.env.WALLET_VERIFY_NETWORKS = 'mainnet, testnet';
    expect(readVerificationNetworks().map((endpoint) => endpoint.network)).toEqual([
      'mainnet',
      'testnet',
    ]);
  });

  it('carries the grpc url each network is read on', () => {
    process.env.SUI_NETWORK = 'testnet';
    const [first] = readVerificationNetworks();
    expect(first?.grpcUrl).toBe('https://fullnode.testnet.sui.io:443');
  });
});
