import { Injectable } from '@nestjs/common';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import type { WalletSignatureVerifier } from '../../domain/accounts/wallet-signature-verifier';

/* Checks an Ed25519 personal message signature and that the key that signed
   owns the address claimed. Needs no node: the address is derived from the
   public key the signature carries, so a match is proof of control. This is
   the signed-challenge half of IdentityPort.verifyControl. */
@Injectable()
export class SuiWalletSignatureVerifier implements WalletSignatureVerifier {
  async verifies(input: { address: string; message: string; signature: string }): Promise<boolean> {
    try {
      const publicKey = await verifyPersonalMessageSignature(
        new TextEncoder().encode(input.message),
        input.signature,
        { address: input.address },
      );
      return publicKey.toSuiAddress().toLowerCase() === input.address.toLowerCase();
    } catch {
      return false;
    }
  }
}
