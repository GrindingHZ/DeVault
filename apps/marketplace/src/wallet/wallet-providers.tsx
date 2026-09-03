import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import type { ReactElement, ReactNode } from 'react';
import '@mysten/dapp-kit/dist/index.css';

/* The networks a connected wallet may sign against. The api decides which one
   settles; this only tells the wallet which chain a signature is for. */
const { networkConfig } = createNetworkConfig({
  localnet: { url: 'http://127.0.0.1:9000', network: 'localnet' },
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

type WalletNetwork = 'localnet' | 'testnet' | 'mainnet';

/* Testnet is the default so a connected wallet and the api agree without any
   local setup; a wallet told the dapp is on a network its account is not on
   fails the signing handshake. VITE_SUI_NETWORK points the app at localnet
   when a developer runs one. */
function walletNetwork(): WalletNetwork {
  const configured = String(import.meta.env.VITE_SUI_NETWORK ?? '');
  if (configured === 'localnet' || configured === 'mainnet') {
    return configured;
  }
  return 'testnet';
}

/* dapp-kit's providers, so a real wallet like Slush is detected and can sign.
   autoConnect brings a previously approved wallet back on reload. The test
   sign in path does not go through these; it signs with a fixture key in the
   app's own code (docs/06-testing.md), so the providers are inert there. */
export function WalletProviders({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork={walletNetwork()}>
      <WalletProvider autoConnect>{children}</WalletProvider>
    </SuiClientProvider>
  );
}
