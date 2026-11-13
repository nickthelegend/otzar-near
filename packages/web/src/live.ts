import { useEffect, useRef, useState } from 'react';
import { contractId } from './lib';
import { useLive, view } from './data';

// Live market and chain reads for the v3 app. Every number here comes from a public service at read time:
// Coinbase Exchange (BTC-USD trades and candles), FastNEAR/dRPC (NEAR testnet blocks and access keys),
// and NearBlocks (contract transactions). Nothing is simulated; a failed read shows its error.

const COINBASE = 'https://api.exchange.coinbase.com/products/BTC-USD';

export type Tick = { price: number; time: number };
type PriceState = { price: number | null; prev: number | null; time: number | null; history: Tick[]; open24: number | null; error: string };
const priceListeners = new Set<(s: PriceState) => void>();
let priceState: PriceState = { price: null, prev: null, time: null, history: [], open24: null, error: '' };
let priceTimer: ReturnType<typeof setInterval> | null = null;
async function pollPrice() {
  if (document.hidden) return;
  try {
    const r = await fetch(`${COINBASE}/ticker`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
    const j = await r.json();
    const price = Number(j.price), time = Date.parse(j.time);
    if (!(price > 0)) throw new Error('Coinbase returned no price');
    const history = [...priceState.history, { price, time }].slice(-120);
    priceState = { ...priceState, prev: priceState.price, price, time, history, error: '' };
  } catch (e) { priceState = { ...priceState, error: (e as Error).message }; }
  priceListeners.forEach(f => f(priceState));
}
async function loadOpen24() {
  try { const r = await fetch(`${COINBASE}/stats`); const j = await r.json(); if (Number(j.open) > 0) { priceState = { ...priceState, open24: Number(j.open) }; priceListeners.forEach(f => f(priceState)); } } catch { /* the change chip is simply hidden */ }
}

/** The last BTC-USD trade on Coinbase Exchange, refreshed every 4 s while the tab is visible. */
export function useBtcPrice() {
  const [s, setS] = useState(priceState);
  useEffect(() => {
    priceListeners.add(setS);
    if (!priceTimer) { pollPrice(); loadOpen24(); priceTimer = setInterval(pollPrice, 4000); }
    return () => { priceListeners.delete(setS); if (!priceListeners.size && priceTimer) { clearInterval(priceTimer); priceTimer = null; } };
  }, []);
  return s;
}

export type Candle = { t: number; low: number; high: number; open: number; close: number };
/** Coinbase BTC-USD candles, oldest first. granularity in seconds (60, 300, 900, 3600, 21600, 86400). */
export function useCandles(granularity = 3600) {
  return useLive<Candle[]>(`candles:${granularity}`, async () => {
    const r = await fetch(`${COINBASE}/candles?granularity=${granularity}`);
    if (!r.ok) throw new Error(`Coinbase candles HTTP ${r.status}`);
    const rows = await r.json() as number[][];
    return rows.map(([t, low, high, open, close]) => ({ t: t * 1000, low, high, open, close })).sort((a, b) => a.t - b.t);
  }, granularity >= 3600 ? 120000 : 30000);
}

const RPCS = ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'];
async function rpc<T>(method: string, params: unknown, prefer = 0): Promise<T> {
  let last = '';
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(RPCS[(i + prefer) % 2], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'otzar', method, params }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160));
      return j.result as T;
    } catch (e) { last = (e as Error).message; }
  }
  throw new Error(`NEAR testnet RPC unavailable (${last})`);
}

/** The latest final NEAR testnet block, polled every 3 s: the heartbeat in the status bar. */
type BlockState = { height: number; time: number; protocol: number | null; error: string };
let lastBlock: BlockState = { height: 0, time: 0, protocol: null, error: '' };
export function useNearBlock() {
  const [b, setRaw] = useState<BlockState>(lastBlock);
  const setB = (f: (p: BlockState) => BlockState) => setRaw(p => (lastBlock = f(p)));
  useEffect(() => {
    let on = true;
    const run = () => { if (document.hidden) return; rpc<any>('block', { finality: 'final' }, 1).then(r => on && setB(p => ({ ...p, height: r.header.height, time: r.header.timestamp_nanosec / 1e6, error: '' }))).catch(e => on && setB(p => ({ ...p, error: (e as Error).message }))); };
    rpc<any>('status', []).then(s => on && setB(p => ({ ...p, protocol: s.protocol_version }))).catch(() => {});
    run(); const t = setInterval(run, 5000);
    return () => { on = false; clearInterval(t); };
  }, []);
  return b;
}

export type AccessKey = { public_key: string; access_key: { nonce: number; permission: 'FullAccess' | { FunctionCall: { receiver_id: string; method_names: string[]; allowance: string | null } } } };
/** The access keys on an account, read live: who can sign for (and redeploy) the contract. */
export function useAccessKeys(account: string | undefined) {
  return useLive<AccessKey[]>(account ? `keys:${account}` : null, async () => (await rpc<{ keys: AccessKey[] }>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account })).keys, 120000);
}

/** sha256 of the deployed contract code, read live (matches the hash recorded at upgrade). */
export function useCodeHash(account: string | undefined) {
  return useLive<{ hash: string; block: number }>(account ? `code:${account}` : null, async () => {
    const r = await rpc<any>('query', { request_type: 'view_code', finality: 'final', account_id: account });
    const bytes = Uint8Array.from(atob(r.code_base64), c => c.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''), block: r.block_height };
  }, 600000);
}

/** The falling Dutch-auction ask for each open round, re-read every 10 s. */
export function useAsks(tokenIds: string[]) {
  const key = tokenIds.length ? `asks:${tokenIds.join(',')}` : null;
  return useLive<Record<string, string | null>>(key, async () => {
    const out: Record<string, string | null> = {};
    for (const id of tokenIds) out[id] = await view<string | null>(contractId!, 'auction_price', { token_id: id }).catch(() => null);
    return out;
  }, 10000);
}

/** Flash a class for a moment whenever a value changes: up (jade) or down (blush). */
export function useFlash(value: number | null) {
  const last = useRef<number | null>(null);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (value === null) return;
    if (last.current !== null && value !== last.current) { setDir(value > last.current ? 'up' : 'down'); const t = setTimeout(() => setDir(''), 900); last.current = value; return () => clearTimeout(t); }
    last.current = value;
  }, [value]);
  return dir;
}

export const usd = (v: number | null | undefined, digits = 2) => v === null || v === undefined || !isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
