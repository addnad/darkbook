'use client';

import { useEffect, useState } from 'react';

const BACKEND_URL = 'http://localhost:3001';

interface PendingIntent {
  id: string;
  side: string;
  amount: string;
  min_price: number;
  createdAt: number;
  expiresAt: number;
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemaining(left);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const seconds = Math.floor((remaining / 1000) % 60);
  const minutes = Math.floor(remaining / 60000);
  const pct = Math.max(0, (remaining / 120000) * 100);
  const color = pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400';

  if (remaining === 0) return (
    <span className="text-[10px] font-mono text-white/40">→ DeepBook</span>
  );

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white/60">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

export default function PendingIntents() {
  const [intents, setIntents] = useState<PendingIntent[]>([]);

  useEffect(() => {
    async function fetchIntents() {
      try {
        const res = await fetch(`${BACKEND_URL}/intents`);
        const data = await res.json();
        setIntents(data.intents ?? []);
      } catch {}
    }
    fetchIntents();
    const interval = setInterval(fetchIntents, 2000);
    return () => clearInterval(interval);
  }, []);

  if (intents.length === 0) return null;

  return (
    <div className="w-full mt-4 pt-4 border-t border-white/10">
      <p className="text-[10px] font-mono text-white/50 uppercase tracking-widest mb-3">
        Live Order Book ({intents.length})
      </p>
      <div className="space-y-2">
        {intents.map((intent) => {
          const amountSui = (parseFloat(intent.amount) / 1_000_000_000).toFixed(2);
          const minPriceUsd = (intent.min_price / 1_000_000).toFixed(2);
          const sideColor = intent.side === 'buy' ? 'text-emerald-400' : 'text-red-400';
          return (
            <div key={intent.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono font-medium uppercase ${sideColor}`}>{intent.side}</span>
                <span className="text-xs font-mono text-white">{amountSui} SUI</span>
                <span className="text-xs font-mono text-white/40">@ ${minPriceUsd}</span>
              </div>
              <Countdown expiresAt={intent.expiresAt} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
