'use client';

import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, ConnectModal } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = '0xf3192aa949eb9e9ede9e0cf2cdb6d966479fe10f101e72b77caaafba28b87499';
const VAULT_ID = '0x60152b4b1d674d82b0bfcb1a874447ce3b0ca093d26b9cb05dc8fd1e240051af';
const VAULT_INITIAL_VERSION = 908201511;

export default function CancelPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [intentId, setIntentId] = useState('');
  const [intentVersion, setIntentVersion] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);

  async function handleAction(action: 'cancel' | 'withdraw') {
    if (!account || !intentId || !intentVersion) return;
    setStatus('Building transaction...');
    try {
      const tx = new Transaction();
      tx.setGasBudget(50_000_000);
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::${action}`,
        arguments: [
          tx.sharedObjectRef({ objectId: VAULT_ID, initialSharedVersion: VAULT_INITIAL_VERSION, mutable: true }),
          tx.sharedObjectRef({ objectId: intentId, initialSharedVersion: Number(intentVersion), mutable: true }),
        ],
      });
      setStatus('Waiting for wallet approval...');
      const result = await signAndExecute({ transaction: tx });
      setStatus(`Success! Digest: ${result.digest}`);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-white text-2xl font-mono">Manage Intent</h1>
      {!account ? (
        <ConnectModal trigger={<button className="px-6 py-2 rounded-full bg-[#004FE5] text-white">Connect Wallet</button>} open={open} onOpenChange={setOpen} />
      ) : (
        <div className="flex flex-col gap-4 w-full max-w-lg">
          <p className="text-gray-400 text-sm font-mono">Connected: {account.address.slice(0,8)}...{account.address.slice(-6)}</p>
          <label className="text-gray-400 text-xs font-mono uppercase">Intent Object ID</label>
          <input value={intentId} onChange={e => setIntentId(e.target.value)} placeholder="0x..." className="bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-mono" />
          <label className="text-gray-400 text-xs font-mono uppercase">Initial Shared Version</label>
          <input value={intentVersion} onChange={e => setIntentVersion(e.target.value)} placeholder="885018894" className="bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-mono" />
          <div className="flex gap-3">
            <button onClick={() => handleAction('cancel')} className="flex-1 px-6 py-2 rounded-full bg-[#004FE5] text-white font-medium hover:bg-[#0041C1] transition-colors">
              Cancel Intent
            </button>
            <button onClick={() => handleAction('withdraw')} className="flex-1 px-6 py-2 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors">
              Withdraw (Matched)
            </button>
          </div>
          {status && <p className="text-sm font-mono text-gray-300 break-all">{status}</p>}
        </div>
      )}
    </main>
  );
}
