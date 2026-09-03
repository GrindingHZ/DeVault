import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

/* A wallet whose key lives in the app, present only when VITE_TEST_WALLET is
   set, so a browser test can sign in and sign transactions without driving a
   real extension (docs/06-testing.md). The seed is fixed so the same wallet
   comes back every run, and it is null in every build that is not a test. */
const testWalletEnabled = import.meta.env.VITE_TEST_WALLET === '1';

export const testKeypair: Ed25519Keypair | null = testWalletEnabled
  ? Ed25519Keypair.deriveKeypairFromSeed('7'.repeat(64))
  : null;
