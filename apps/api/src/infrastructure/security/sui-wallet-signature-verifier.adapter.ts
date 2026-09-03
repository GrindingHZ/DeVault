import { Injectable } from '@nestjs/common';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import type { ChainClient } from '../chain/chain-client';
import type { WalletSignatureVerifier } from '../../domain/accounts/wallet-signature-verifier';

/* Checks a personal message signature and that the key that signed owns the
   address claimed. A seed phrase account (Ed25519 or secp) verifies offline:
   the address is derived from the public key the signature carries, so a match
   is proof of control. A zkLogin account, the kind a Google sign in makes, has
   no such key; its proof is checked against the network's on-chain JWKs and
   current epoch through the full node, which is why this holds a client. The
   client is untouched for the offline schemes. This is the signed-challenge
   half of IdentityPort.verifyControl. */
@Injectable()
export class SuiWalletSignatureVerifier implements WalletSignatureVerifier {
  constructor(private readonly client: ChainClient) {}

  async verifies(input: { address: string; message: string; signature: string }): Promise<boolean> {
    try {
      const publicKey = await verifyPersonalMessageSignature(
        new TextEncoder().encode(input.message),
        input.signature,
        { address: input.address, client: this.client },
      );
      return publicKey.toSuiAddress().toLowerCase() === input.address.toLowerCase();
    } catch {
      return false;
    }
  }
}
