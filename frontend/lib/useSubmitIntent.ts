'use client';

import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = '0xd2ceb60740725ec1b962511378c8701b54173354a133175ec7663160af925eb5';
const VAULT_ID = '0xadddb5525c4583602945353a143e7a19ce687b22cede1563b32f8cdfb45df160';
const VAULT_INITIAL_VERSION = 909793926;
const BACKEND_URL = 'https://darkbook-backend.onrender.com';
const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';

export type IntentResult =
  | { status: 'matched'; digest: string; matchedWith: string; price: number; venue: string }
  | { status: 'pending'; intentId: string; message: string }
  | { status: 'routed'; venue: string; digest: string; received?: { amount: string; coinType: string }[]; price: number; side: string; amount: string };

export interface SubmitIntentParams {
  side: 'BUY' | 'SELL';
  amountSui: number;
  minPriceUsd: number;
}

export async function pollForSettlement(
  walletAddress: string,
  afterMs: number,
  onSettled: (result: IntentResult) => void,
  signal: AbortSignal
) {
  while (!signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    if (signal.aborted) break;
    try {
      const res = await fetch(TESTNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_queryEvents',
          params: [
            { MoveEventType: `${PACKAGE_ID}::vault::Settled` },
            null,
            10,
            true,
          ],
        }),
      });
      const data = await res.json();
      const events = data?.result?.data ?? [];
      const match = events.find((e: any) => {
        const ts = parseInt(e.timestampMs);
        const json = e.parsedJson;
        return ts >= afterMs && (json.buyer === walletAddress || json.seller === walletAddress);
      });
      if (match) {
        const json = match.parsedJson;
        const matchedWith = json.buyer === walletAddress ? json.seller : json.buyer;
        onSettled({
          status: 'matched',
          digest: match.id.txDigest,
          matchedWith,
          price: parseInt(json.price),
          venue: 'darkpool',
        });
        break;
      }
    } catch {}
  }
}

export async function pollForRouting(
  intentId: string,
  onRouted: (result: IntentResult) => void,
  signal: AbortSignal
) {
  while (!signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (signal.aborted) break;
    try {
      const res = await fetch(`${BACKEND_URL}/routing/${intentId}`);
      const data = await res.json();
      if (data.status === 'routed') {
        onRouted({
          status: 'routed',
          venue: data.venue,
          digest: data.digest,
          received: data.received,
          price: data.price,
          side: data.side,
          amount: data.amount,
        });
        break;
      }
      if (data.status === 'routing_failed') {
        onRouted({
          status: 'routing_failed',
          error: data.error,
        } as any);
        break;
      }
    } catch {}
  }
}

export function useSubmitIntent() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function submitIntent({ side, amountSui, minPriceUsd }: SubmitIntentParams): Promise<IntentResult> {
    if (!account) throw new Error('Wallet not connected');

    const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
    const minPriceScaled = Math.round(minPriceUsd * 1_000_000);
    const sideU8 = side === 'BUY' ? 0 : 1;
    const expiresAt = Date.now() + 120_000;

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

    const result = await signAndExecute({ transaction: tx });

    // Fetch full tx details via backend proxy
    await new Promise(resolve => setTimeout(resolve, 1500));
    const txRes = await fetch(`${BACKEND_URL}/tx/${result.digest}`);
    const txDetails = await txRes.json();

    const events = txDetails?.events ?? [];
    const depositedEvent = events.find((e: any) => e.type?.includes('::vault::Deposited'));

    const objectChanges = txDetails?.objectChanges ?? [];
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
