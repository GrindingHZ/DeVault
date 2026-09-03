/* A read-only full node client for the wallet reads, kept behind a token so it
   is distinct from the operator's signing client and can be faked in a test. */
export const WALLET_READ_CLIENT = Symbol('WalletReadClient');
