import { Injectable, Logger } from '@nestjs/common';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import type { ChainClient } from '../chain/chain-client';
import type { WalletSignatureVerifier } from '../../domain/accounts/wallet-signature-verifier';

export interface VerificationTarget {
  readonly network: string;
  readonly client: ChainClient;
}

export type PersonalMessageVerifier = (
  message: Uint8Array,
  signature: string,
  options: { readonly address: string; readonly client: ChainClient },
) => Promise<{ toSuiAddress: () => string }>;

export interface VerificationLog {
  warn(line: string): void;
}

/* Raised when every node we asked was unreachable. A node we could not reach
   says nothing about the signature, and answering "invalid" would tell a member
   they typed something wrong when the truth is that we could not check. */
export class WalletVerificationUnavailable extends Error {
  constructor() {
    super('No full node could be reached to check this signature');
    this.name = 'WalletVerificationUnavailable';
  }
}

const verifyThroughSdk: PersonalMessageVerifier = async (message, signature, options) =>
  verifyPersonalMessageSignature(message, signature, options);

const transportCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const transportPhrases = [
  'fetch failed',
  'socket hang up',
  'network error',
  'timed out',
  'timeout',
  'deadline exceeded',
  'unavailable',
];

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* Whether the node was the problem rather than the signature. Anything we
   cannot place is treated as a rejection, so a real forgery is never waved
   through on the strength of an error we did not recognise. */
function isTransportFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  if (transportCodes.has(code)) {
    return true;
  }
  const text = reasonOf(error).toLowerCase();
  return transportPhrases.some((phrase) => text.includes(phrase));
}

/* Checks a personal message signature and that the key that signed owns the
   address claimed. A seed phrase account (Ed25519 or secp) verifies offline:
   the address is derived from the public key the signature carries, so the
   first target settles it and no node is touched. A zkLogin account, the kind
   a Google sign in makes, has no such key; its proof is checked against a
   network's on-chain JWKs and current epoch through a full node.

   That check is network bound. A zkLogin proof commits to a maxEpoch, and
   every Sui network counts epochs on its own, so a proof made on mainnet can
   never satisfy testnet. The address, however, is the same on every network,
   and the challenge is our own single use nonce, so proving control anywhere
   proves control here. Rather than force a member to move their wallet to the
   network we settle on just to open the door, each network in
   readVerificationNetworks is asked in turn. This is the signed-challenge half
   of IdentityPort.verifyControl. */
@Injectable()
export class SuiWalletSignatureVerifier implements WalletSignatureVerifier {
  constructor(
    private readonly targets: readonly VerificationTarget[],
    private readonly verify: PersonalMessageVerifier = verifyThroughSdk,
    private readonly log: VerificationLog = new Logger(SuiWalletSignatureVerifier.name),
  ) {}

  async verifies(input: { address: string; message: string; signature: string }): Promise<boolean> {
    const message = new TextEncoder().encode(input.message);
    const claimed = input.address.toLowerCase();
    let wasRefused = false;
    let wasUnreachable = false;

    for (const target of this.targets) {
      try {
        const publicKey = await this.verify(message, input.signature, {
          address: input.address,
          client: target.client,
        });
        if (publicKey.toSuiAddress().toLowerCase() === claimed) {
          return true;
        }
        wasRefused = true;
        this.log.warn(`${target.network} verified this signature to a different address`);
      } catch (error) {
        if (isTransportFailure(error)) {
          wasUnreachable = true;
          this.log.warn(`could not reach ${target.network}: ${reasonOf(error)}`);
          continue;
        }
        wasRefused = true;
        this.log.warn(`${target.network} refused the signature: ${reasonOf(error)}`);
      }
    }

    if (wasUnreachable && !wasRefused) {
      throw new WalletVerificationUnavailable();
    }
    return false;
  }
}
