/* Injection tokens for the chain module, kept apart from the classes so a
   module can wire a fake behind the same token in a test. */
export const CHAIN_CONFIGURATION = Symbol('ChainConfiguration');
export const CHAIN_CLIENT = Symbol('ChainClient');
export const CHAIN_SUBMITTER = Symbol('ChainSubmitter');
