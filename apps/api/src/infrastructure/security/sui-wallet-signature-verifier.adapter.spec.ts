import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it } from 'vitest';
import type { ChainClient } from '../chain/chain-client';
import { SuiWalletSignatureVerifier } from './sui-wallet-signature-verifier.adapter';

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

async function sign(keypair: Ed25519Keypair, message: string): Promise<string> {
  const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(message));
  return signature;
}

describe('SuiWalletSignatureVerifier', () => {
  const verifier = new SuiWalletSignatureVerifier(offlineOnlyClient);
  const message = 'Sign in to DeVault\nNonce: 01ABC';

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
