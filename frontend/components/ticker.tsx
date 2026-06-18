'use client';

import { useEffect, useState } from 'react';

interface Pair {
  pool: string;
  base: string;
  quote: string;
  last_price: number;
  highest_bid: number;
  lowest_ask: number;
  price_change_24h: number;
}

export default function Ticker({ dark = false }: { dark?: boolean }) {
  const [pairs, setPairs] = useState<Pair[]>([]);

  useEffect(() => {
    async function fetchPairs() {
      try {
        const res = await fetch('https://darkbook-backend.onrender.com/deepbook/pairs');
        const data = await res.json();
        setPairs(data.pairs);
      } catch {}
    }
    fetchPairs();
    const interval = setInterval(fetchPairs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (pairs.length === 0) return null;

  const renderItems = (suffix: string) => pairs.map((p, i) => {
    const price = p.last_price || p.highest_bid || 0;
    const change = p.price_change_24h;
    const changeStr = change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : null;
    return (
      <span key={`${suffix}-${i}`} className="inline-flex items-center gap-1.5 text-xs font-mono mx-5">
        <span className={`${dark ? "text-white/60" : "text-black/60"}`}>{p.base}/{p.quote}</span>
        <span className={`${dark ? "text-white" : "text-black"}`}>${price.toFixed(4)}</span>
        {changeStr && (
          <span className={change > 0 ? (dark ? "text-emerald-400" : "text-emerald-600") : (dark ? "text-red-400" : "text-red-500")}>
            {changeStr}
          </span>
        )}
        <span className={`${dark ? "text-white/20" : "text-black/20"} ml-3`}>·</span>
      </span>
    );
  });

  return (
    <div className="overflow-hidden w-full flex">
      <div className="flex animate-ticker">
        {renderItems('a')}
        {renderItems('b')}
      </div>
    </div>
  );
}
