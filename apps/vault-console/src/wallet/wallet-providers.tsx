import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import type { ReactElement, ReactNode } from 'react';
import '@mysten/dapp-kit/dist/index.css';

/* The networks a connected wallet may sign against. Reads are computed by the
   api from the chain, so this only tells the wallet which chain a signature is
   for. */
const { networkConfig } = createNetworkConfig({
  localnet: { url: 'http://127.0.0.1:9000', network: 'localnet' },
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

type WalletNetwork = 'localnet' | 'testnet' | 'mainnet';

function walletNetwork(): WalletNetwork {
  const configured = String(import.meta.env.VITE_SUI_NETWORK ?? '');
  if (configured === 'localnet' || configured === 'mainnet') {
    return configured;
  }
  return 'testnet';
}

/* dapp-kit's providers, so a custodian's wallet like Slush is detected and can
   sign. autoConnect brings a previously approved wallet back on reload. */
export function WalletProviders({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork={walletNetwork()}>
      <WalletProvider autoConnect>{children}</WalletProvider>
    </SuiClientProvider>
  );
}
