/* The set of wallet addresses the platform has authorised as vault staff,
   lower-cased. Injected into the wallet sign in so an authorised wallet becomes
   a custodian and every other wallet a member, with no row to seed. */
export const CUSTODIAN_WALLET_ADDRESSES = Symbol('CustodianWalletAddresses');
