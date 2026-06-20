'use client';

import { useState } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import Ticker from './ticker';

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Nav() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-20 grid grid-cols-3 items-center px-6 py-4">
      <span className="flex items-center gap-2 text-sm font-mono tracking-[0.2em] uppercase text-black mix-blend-exclusion">
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M17 8 H9 V40 H17" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path d="M31 8 H39 V40 H31" stroke="currentColor" strokeWidth="4" fill="none"/>
          <rect x="20" y="21" width="8" height="6" fill="currentColor"/>
        </svg>
        DarkBook
      </span>
      <div className="flex justify-center overflow-hidden">
        <Ticker />
      </div>
      <div className="flex justify-end">
        {account ? (
          <button
            onClick={() => disconnect()}
            className="px-5 py-2 rounded-full text-sm font-medium bg-[#004FE5] text-white hover:bg-[#0041C1] transition-colors"
          >
            {truncate(account.address)}
          </button>
        ) : (
          <ConnectModal
            trigger={
              <button className="px-5 py-2 rounded-full text-sm font-medium bg-[#004FE5] text-white hover:bg-[#0041C1] transition-colors">
                Connect Wallet
              </button>
            }
            open={open}
            onOpenChange={setOpen}
          />
        )}
      </div>
    </nav>
  )
}
