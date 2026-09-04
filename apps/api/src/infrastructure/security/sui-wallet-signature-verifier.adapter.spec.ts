import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it } from 'vitest';
import type { ChainClient } from '../chain/chain-client';
import {
  SuiWalletSignatureVerifier,
  WalletVerificationUnavailable,
} from './sui-wallet-signature-verifier.adapter';
import type {
  PersonalMessageVerifier,
  VerificationTarget,
} from './sui-wallet-signature-verifier.adapter';

/* A full node client that fails loudly if touched, so these cases prove a seed
   phrase signature verifies offline and never reaches the network only the
   zkLogin path needs. The zkLogin path itself is proven against a live testnet
   full node, which no unit test can stand in for. */
const offlineOnlyClient = {
  core: {
    verifyZkLoginSignature: (): never => {
      throw new Error('a seed phrase signature must not call the node');
    },
  },
} as unknown as ChainClient;

function targets(...networks: string[]): VerificationTarget[] {
  return networks.map((network) => ({ network, client: offlineOnlyClient }));
}

function collectingLog(): { warn: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { warn: (line: string) => lines.push(line), lines };
}

async function sign(keypair: Ed25519Keypair, message: string): Promise<string> {
  const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(message));
  return signature;
}

const message = 'Sign in to DeVault\nNonce: 01ABC';

describe('SuiWalletSignatureVerifier', () => {
  const verifier = new SuiWalletSignatureVerifier(targets('testnet'), undefined, collectingLog());

  it('accepts a personal message signed by the address it claims', async () => {
    const keypair = new Ed25519Keypair();
    const verified = await verifier.verifies({
      address: keypair.toSuiAddress(),
      message,
      signature: await sign(keypair, message),
    });
    expect(verified).toBe(true);
  });

  it('rejects a signature made by a different key', async () => {
    const verified = await verifier.verifies({
      address: new Ed25519Keypair().toSuiAddress(),
      message,
      signature: await sign(new Ed25519Keypair(), message),
    });
    expect(verified).toBe(false);
  });

  it('rejects a malformed signature', async () => {
    const verified = await verifier.verifies({
      address: new Ed25519Keypair().toSuiAddress(),
      message,
      signature: 'not-a-real-signature',
    });
    expect(verified).toBe(false);
  });
});

/* The zkLogin cases below drive the loop through a stand in verifier. A real
   zkLogin proof cannot be made in a unit test, but which networks get asked,
   in what order, and what happens when a node is unreachable are all decided
   here rather than by the sdk. */
describe('SuiWalletSignatureVerifier across networks', () => {
  const address = new Ed25519Keypair().toSuiAddress();

  function verifierThat(
    behaviour: (network: string) => Promise<{ toSuiAddress: () => string }>,
    asked: string[],
  ): PersonalMessageVerifier {
    return async (_message, _signature, options) => {
      const target = targetNetworkOf(options.client);
      asked.push(target);
      return behaviour(target);
    };
  }

  /* Each target carries its own marker object so the stand in can tell which
     network it was handed. */
  const markers = new Map<ChainClient, string>();
  function markedTargets(...networks: string[]): VerificationTarget[] {
    return networks.map((network) => {
      const client = { marker: network } as unknown as ChainClient;
      markers.set(client, network);
      return { network, client };
    });
  }
  function targetNetworkOf(client: ChainClient): string {
    return markers.get(client) ?? 'unknown';
  }

  it('accepts a proof that only the second network can verify', async () => {
    const asked: string[] = [];
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet', 'mainnet'),
      verifierThat(async (network) => {
        if (network === 'testnet') {
          throw new Error('zkLogin proof expired');
        }
        return { toSuiAddress: () => address };
      }, asked),
      collectingLog(),
    );

    expect(await verifier.verifies({ address, message, signature: 'zk' })).toBe(true);
    expect(asked).toEqual(['testnet', 'mainnet']);
  });

  it('stops at the first network that verifies', async () => {
    const asked: string[] = [];
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet', 'mainnet'),
      verifierThat(async () => ({ toSuiAddress: () => address }), asked),
      collectingLog(),
    );

    expect(await verifier.verifies({ address, message, signature: 'zk' })).toBe(true);
    expect(asked).toEqual(['testnet']);
  });

  it('refuses a proof no network accepts, and says why for each', async () => {
    const asked: string[] = [];
    const log = collectingLog();
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet', 'mainnet'),
      verifierThat(async () => {
        throw new Error('zkLogin proof expired');
      }, asked),
      log,
    );

    expect(await verifier.verifies({ address, message, signature: 'zk' })).toBe(false);
    expect(asked).toEqual(['testnet', 'mainnet']);
    expect(log.lines.join('\n')).toContain('zkLogin proof expired');
  });

  /* A node we could not reach tells us nothing about the signature. Reporting
     it as a bad signature is what made a flaky full node look like a member
     typing the wrong thing, so it is raised instead of denied. */
  it('raises rather than denies when no network could be reached', async () => {
    const unreachable: PersonalMessageVerifier = async () => {
      throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    };
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet', 'mainnet'),
      unreachable,
      collectingLog(),
    );

    await expect(verifier.verifies({ address, message, signature: 'zk' })).rejects.toBeInstanceOf(
      WalletVerificationUnavailable,
    );
  });

  it('denies when one network answered invalid and another was unreachable', async () => {
    const asked: string[] = [];
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet', 'mainnet'),
      verifierThat(async (network) => {
        if (network === 'testnet') {
          throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
        }
        throw new Error('zkLogin proof expired');
      }, asked),
      collectingLog(),
    );

    expect(await verifier.verifies({ address, message, signature: 'zk' })).toBe(false);
  });

  it('refuses a proof that verifies to a different address', async () => {
    const asked: string[] = [];
    const verifier = new SuiWalletSignatureVerifier(
      markedTargets('testnet'),
      verifierThat(
        async () => ({ toSuiAddress: () => new Ed25519Keypair().toSuiAddress() }),
        asked,
      ),
      collectingLog(),
    );

    expect(await verifier.verifies({ address, message, signature: 'zk' })).toBe(false);
  });
});
