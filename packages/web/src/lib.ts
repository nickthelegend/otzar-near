import { rpcQuery } from '@hako/sdk';

export type Box = {
  token_id: string;
  owner_id: string;
  epoch: number;
  policy: { daily_eth_wei: string; delay_sec: number; allow_eth: string[]; guardian: string; recovery_eth: string; emergency_migration: string | null };
  pq_key: number[] | null;
  nonce: number;
  listed_yocto: string | null;
  ever_signed: boolean;
};

export type Spend = { id: number; token_id: string; raw_unsigned_hex: string; destination: string; amount_wei: string; created_ns: number; ready_ns: number; state: string; signature_json: string | null; clawback: boolean };

export const contractId = import.meta.env.VITE_HAKO_CONTRACT as string | undefined;
export const anvilUrl = (import.meta.env.VITE_ANVIL_RPC_URL as string | undefined) || 'http://127.0.0.1:8545';
export const esploraUrl = import.meta.env.VITE_BITCOIN_ESPLORA_URL as string | undefined;
export const ZERO_ETH = '0x0000000000000000000000000000000000000000';

export const nearblocksTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const nearblocksAccount = (id: string) => `https://testnet.nearblocks.io/address/${id}`;

export function formatEth(wei: bigint | string) { return (Number(BigInt(wei)) / 1e18).toFixed(6); }
export function short(value: string, head = 6, tail = 4) { return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value; }

export async function loadBoxes(): Promise<Box[]> {
  if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
  return await rpcQuery(contractId, 'nft_tokens', { from_index: 0, limit: 100 }) as Box[];
}

export type ChainTx = { hash: string; method: string; signer: string; ok: boolean; ns: number };

/** Recent transactions to the Hako contract, read from the NearBlocks v3 public API (testnet). */
export async function recentContractTxns(limit = 6): Promise<ChainTx[]> {
  if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
  const r = await fetch(`https://api-testnet.nearblocks.io/v3/accounts/${contractId}/txns?per_page=${limit}`);
  if (!r.ok) throw new Error(`NearBlocks HTTP ${r.status}`);
  const body = await r.json();
  if (!Array.isArray(body.data)) throw new Error(body.errors?.[0]?.message || 'NearBlocks returned no data');
  return body.data.slice(0, limit).map((t: any) => ({
    hash: t.transaction_hash,
    method: t.actions?.[0]?.method || (t.actions?.[0]?.action || 'tx').toLowerCase().replace(/_/g, ' '),
    signer: t.signer_account_id,
    ok: t.outcomes?.status !== false,
    ns: Number(t.block_timestamp),
  }));
}

export function ago(ns: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ns / 1e6) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function navigate(path: string) {
  if (location.pathname === path) { scrollTo({ top: 0 }); return; }
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
  scrollTo({ top: 0 });
}
