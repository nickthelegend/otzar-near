import { useEffect, useState } from 'react';
import { contractId, recentContractTxns, type Box, type CallConfig, type ChainTx, type CoveredCall, type RelayerPrice, type Round } from './lib';

// One shared cache for live reads, so pages that mount together share a single RPC request.
type Entry = { at: number; data?: unknown; pending?: Promise<unknown> };
const cache = new Map<string, Entry>();

function cached<T>(key: string, load: () => Promise<T>, maxAge: number): Promise<T> {
  const hit = cache.get(key);
  if (hit?.pending) return hit.pending as Promise<T>;
  if (hit && 'data' in hit && Date.now() - hit.at < maxAge) return Promise.resolve(hit.data as T);
  const pending = load().then(data => { cache.set(key, { at: Date.now(), data }); return data; })
    .catch(e => { cache.set(key, { ...(hit || { at: 0 }), pending: undefined }); throw e; });
  cache.set(key, { ...(hit || { at: 0 }), pending });
  return pending;
}

export type LiveRead<T> = { data: T | null; error: string; loading: boolean; reload: () => void };

/** A live read, refreshed every `every` ms while the tab is visible. Keeps the last good value if a refresh fails. */
export function useLive<T>(key: string | null, load: () => Promise<T>, every = 60000): LiveRead<T> {
  const initial = key ? cache.get(key) : undefined;
  const [data, setData] = useState<T | null>(initial && 'data' in initial ? initial.data as T : null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) { setData(null); setError(''); return; }
    let on = true;
    const run = (force = false) => {
      if (force) cache.delete(key);
      cached(key, load, every * 0.9).then(d => { if (on) { setData(d); setError(''); } }).catch(e => on && setError((e as Error).message));
    };
    run(tick > 0);
    const t = setInterval(() => { if (!document.hidden) run(); }, every);
    return () => { on = false; clearInterval(t); };
  }, [key, tick]);
  return { data, error, loading: data === null && !error, reload: () => setTick(t => t + 1) };
}

// Public testnet RPCs rate-limit bursts (HTTP 429, which browsers surface as a CORS failure). Reads go to
// FastNEAR first and fail over to dRPC, with a short backoff, before failing loudly.
const RPCS = ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'];
let turn = 0;
export async function view<T = unknown>(accountId: string, method: string, args: object = {}, prefer?: number): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'hako', method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: accountId, method_name: method, args_base64: btoa(JSON.stringify(args)) } });
  let last = '';
  const start = prefer ?? turn++;
  for (let i = 0; i < 6; i++) {
    const url = RPCS[(start + i) % RPCS.length];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) { const m = JSON.stringify(j.error); if (/MethodNotFound|does not exist|panicked|CodeDoesNotExist/i.test(m)) throw Object.assign(new Error(m), { fatal: true }); throw new Error(m); }
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result as number[]))) as T;
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = (e as Error).message;
      if (i % 2 === 1) await new Promise(res => setTimeout(res, 700 * (i + 1)));
    }
  }
  throw new Error(`NEAR testnet RPC unavailable (${last})`);
}

const need = () => { if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT'); return contractId; };

const loadBoxes = () => view<Box[]>(need(), 'nft_tokens', { from_index: 0, limit: 100 });
export const useBoxes = () => useLive<Box[]>('boxes', loadBoxes, 30000);

/** Every covered call on every vault NFT, newest first: `call_history` read per box. */
async function loadRounds(): Promise<Round[]> {
  const id = need();
  const boxes = await cached('boxes', loadBoxes, 27000);
  const out: Round[] = [];
  const queue = [...boxes];
  const worker = async (lane: number) => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      const history = await view<CoveredCall[]>(id, 'call_history', { token_id: b.token_id }, lane);
      for (const c of history || []) out.push({ ...c, key: `${c.token_id}#${c.id}` });
    }
  };
  await Promise.all([worker(0), worker(1), worker(0), worker(1)]);
  return out.sort((a, b) => b.opened_ns - a.opened_ns);
}
export const useRounds = () => useLive<Round[]>('rounds', loadRounds, 60000);

export const useRelayer = () => useLive<RelayerPrice | null>('relayer', () => view<RelayerPrice | null>(need(), 'relayer_price', {}), 60000);
export const useCallConfig = () => useLive<CallConfig | null>('cfg', () => view<CallConfig | null>(need(), 'call_config', {}), 300000);
export const useTxns = () => useLive<ChainTx[]>('txns', () => recentContractTxns(12), 45000);

/** The connected account's tUSDC (Otzar test token) balance, in 6-decimal units. */
export function useTusdc(account: string) {
  const cfg = useCallConfig();
  const token = cfg.data?.premium_token || '';
  return useLive<string>(account && token ? `tusdc:${account}` : null, async () => String(await view<string>(token, 'ft_balance_of', { account_id: account })), 30000);
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => { const mq = matchMedia(query); const on = () => setMatch(mq.matches); mq.addEventListener('change', on); on(); return () => mq.removeEventListener('change', on); }, [query]);
  return match;
}
