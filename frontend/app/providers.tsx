'use client';

import type { ReactNode } from 'react';
import '@mysten/dapp-kit/dist/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';

const queryClient = new QueryClient();

const networks = {
  testnet: { url: 'https://fullnode.testnet.sui.io:443' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
};

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
