import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { ChainConfiguration } from '../../config/chain-configuration';

/* The one key the api signs with. It holds the three capabilities, pays the
   gas, and is the sender of every transaction a use case produces. It belongs
   in a key management service rather than an environment variable once real
   money is behind it (docs/08-web3-migration.md, who signs what). */
export class OperatorSigner {
  readonly keypair: Ed25519Keypair;
  readonly address: string;

  constructor(configuration: ChainConfiguration) {
    this.keypair = Ed25519Keypair.fromSecretKey(configuration.operatorSecretKey);
    this.address = this.keypair.toSuiAddress();
  }
}
