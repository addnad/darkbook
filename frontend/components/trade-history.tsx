'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';

const PACKAGE_ID = '0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3';
const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';

interface Trade {
  txDigest: string;
  amount: string;
  intent_id: string;
  timestampMs: string;
  side?: number;
  min_price?: string;
  matched?: boolean;
}

async function fetchIntentDetails(intentId: string) {
  try {
    const res = await fetch(TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [intentId, { showContent: true }],
      }),
    });
    const data = await res.json();
    const fields = data?.result?.data?.content?.fields;
    return fields ?? null;
  } catch {
    return null;
  }
}

export default function TradeHistory({ onRefresh }: { onRefresh?: number }) {
  const account = useCurrentAccount();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) { setTrades([]); return; }

    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await fetch(TESTNET_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_queryEvents',
            params: [
              { MoveEventType: `${PACKAGE_ID}::vault::Deposited` },
              null,
              50,
              true,
            ],
          }),
        });
        const data = await res.json();
        const events = data?.result?.data ?? [];
        const mine = events
          .filter((e: any) => e.parsedJson?.user === account.address)
          .slice(0, 3)
          .map((e: any) => ({
            txDigest: e.id.txDigest,
            amount: e.parsedJson.amount,
            intent_id: e.parsedJson.intent_id,
            timestampMs: e.timestampMs,
          }));

        // Fetch intent details for each trade
        const withDetails = await Promise.all(
          mine.map(async (t: Trade) => {
            const fields = await fetchIntentDetails(t.intent_id);
            return {
              ...t,
              side: fields?.side,
              min_price: fields?.min_price,
              matched: fields?.matched,
            };
          })
        );

        setTrades(withDetails);
      } catch {}
      setLoading(false);
    }

    fetchHistory();
  }, [account, onRefresh]);

  if (!account) return null;

  return (
    <div className="w-full mt-6 pt-5 border-t border-white/10">
      <p className="text-[10px] font-mono text-white/50 uppercase tracking-widest mb-3">Recent Intents</p>
      {loading ? (
        <p className="text-white/30 text-xs font-mono">Loading...</p>
      ) : trades.length === 0 ? (
        <p className="text-white/30 text-xs font-mono">No trades yet for this wallet.</p>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => {
            const amountSui = (parseInt(t.amount) / 1_000_000_000).toFixed(2);
            const minPriceUsd = t.min_price ? `$${(parseInt(t.min_price) / 1_000_000).toFixed(2)}` : null;
            const sideLabel = t.side === 0 ? 'BUY' : 'SELL';
            const sideColor = t.side === 0 ? 'text-emerald-400' : 'text-red-400';
            const status = t.matched ? 'Matched' : 'Pending';
            const statusColor = t.matched ? 'text-emerald-400' : 'text-white/30';
            const date = new Date(parseInt(t.timestampMs)).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return (
              <div key={t.txDigest} className="bg-white/5 rounded-lg px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-medium ${sideColor}`}>{sideLabel}</span>
                    <span className="text-xs font-mono text-white">{amountSui} SUI</span>
                    {minPriceUsd && <span className="text-xs font-mono text-white/40">@ {minPriceUsd}</span>}
                  </div>
                  <span className={`text-[10px] font-mono ${statusColor}`}>{status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/30">{date}</span>
                  
                  <a
                    href={`https://suiscan.xyz/testnet/tx/${t.txDigest}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-white/30 hover:text-white/70 transition-colors"
                  >
                    {t.txDigest.slice(0, 6)}…↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
