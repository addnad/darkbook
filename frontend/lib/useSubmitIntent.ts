'use client';

import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = '0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3';
const VAULT_ID = '0x84e7da902cf30f0946a320a17dee1b52d39bb040ef03822aab2084ab41f2eaba';
const VAULT_INITIAL_VERSION = 349181739;
const BACKEND_URL = 'http://localhost:3001';
const TESTNET_RPC = 'https://sui-testnet.nodeinfra.com';

export type IntentResult =
  | { status: 'matched'; digest: string; matchedWith: string; price: number; venue: string }
  | { status: 'pending'; intentId: string; message: string };

export interface SubmitIntentParams {
  side: 'BUY' | 'SELL';
  amountSui: number;
  minPriceUsd: number;
}

export function useSubmitIntent() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function submitIntent({ side, amountSui, minPriceUsd }: SubmitIntentParams): Promise<IntentResult> {
    if (!account) throw new Error('Wallet not connected');

    const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
    const minPriceScaled = Math.round(minPriceUsd * 1_000_000);
    const sideU8 = side === 'BUY' ? 0 : 1;
    const expiresAt = Date.now() + 30_000;

    const tx = new Transaction();
    tx.setGasBudget(50_000_000);

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::vault::deposit_and_intent`,
      arguments: [
        tx.sharedObjectRef({
          objectId: VAULT_ID,
          initialSharedVersion: VAULT_INITIAL_VERSION,
          mutable: true,
        }),
        coin,
        tx.pure.u8(sideU8),
        tx.pure.u64(minPriceScaled),
        tx.pure.u64(expiresAt),
      ],
    });

    const result = await signAndExecute({
      transaction: tx,
    });

    // Poll for transaction with retries to ensure indexing
    let txDetails: any = null;
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const res2 = await fetch(`${TESTNET_RPC}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getTransactionBlock',
          params: [result.digest, { showObjectChanges: true, showEffects: true, showEvents: true }],
        }),
      });
      txDetails = await res2.json();
      const changes = txDetails?.result?.objectChanges ?? [];
      const found = changes.find((c: any) => c.type === 'created' && c.objectType?.includes('::vault::Intent'));
      if (found) break;
    }

    // Extract Intent from events (most reliable — emitted by deposit_and_intent)
    const events = txDetails?.result?.events ?? [];
    const depositedEvent = events.find((e: any) => e.type?.includes('::vault::Deposited'));
    
    // Fallback to objectChanges
    const objectChanges = txDetails?.result?.objectChanges ?? [];
    const intentObjChange = objectChanges.find(
      (c: any) => c.type === 'created' && c.objectType?.includes('::vault::Intent')
    );

    const onChainId = depositedEvent?.parsedJson?.intent_id ?? intentObjChange?.objectId;
    if (!onChainId) throw new Error('Could not find Intent object in transaction');

    const initialSharedVersion = Number(intentObjChange?.owner?.Shared?.initial_shared_version ?? 0);

    const res = await fetch(`${BACKEND_URL}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: account.address,
        side: sideU8,
        amount: amountMist.toString(),
        min_price: minPriceScaled,
        onChainId,
        initialSharedVersion,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Backend error');
    }

    return await res.json();
  }

  return { submitIntent };
}
