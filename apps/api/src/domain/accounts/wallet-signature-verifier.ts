/* Whether an address signed a message, checked without any knowledge of how.
   Phase 3's IdentityPort.verifyControl for the signed-challenge proof; the
   Sui adapter checks an Ed25519 personal message signature, and the domain
   never learns the scheme (docs/01-architecture.md). */
export interface WalletSignatureVerifier {
  verifies(input: { address: string; message: string; signature: string }): Promise<boolean>;
}

export const WALLET_SIGNATURE_VERIFIER = Symbol('WalletSignatureVerifier');
