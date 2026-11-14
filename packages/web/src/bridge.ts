import { useLive, view } from './data';
import { contractId } from './lib';

// Bitcoin testnet → NEAR testnet through the live Omni BTC connector. Every value is read at view time:
// Blockstream Esplora (Bitcoin testnet3), the connector and nBTC contracts on NEAR, and the Omni Bridge API.
export const CONNECTOR = 'btc-connector.n-bridge.testnet';
export const NBTC = 'nbtc.n-bridge.testnet';
export const LIGHT_CLIENT = 'btc-client-v4.testnet';
const ESPLORA = 'https://blockstream.info/testnet/api';
const OMNI = 'https://testnet.api.bridge.nearone.org';
export const mempoolTx = (txid: string) => `https://mempool.space/testnet/tx/${txid}`;
export const mempoolAddress = (a: string) => `https://mempool.space/testnet/address/${a}`;
export const CONFIRMATIONS = 2;

export type ConnectorConfig = { chain: string; min_deposit_amount: string; deposit_bridge_fee: { fee_min: string }; confirmations_strategy: Record<string, number>; btc_light_client_account_id: string };
export type NbtcVault = { token: string; balance_sats: string; encumbered_sats: string; free_sats: string };

async function esplora<T>(path: string): Promise<T> {
  const r = await fetch(ESPLORA + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Bitcoin testnet explorer HTTP ${r.status}`);
  return (path.endsWith('/height') ? Number(await r.text()) : await r.json()) as T;
}
export type EsploraTx = { txid: string; status: { confirmed: boolean; block_height?: number; block_time?: number }; vout: { scriptpubkey_address?: string; value: number }[]; fee: number };
export const btcTip = () => esplora<number>('/blocks/tip/height');
export async function btcBalance(address: string) {
  const j = await esplora<{ chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } }>(`/address/${address}`);
  return { confirmed: j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum, pending: j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum };
}
export const addressTxs = (address: string) => esplora<EsploraTx[]>(`/address/${address}/txs`);

/** The bridge deposit address for a NEAR account: the connector derives it on chain (MPC key + sha256 of the
 * deposit message). The Omni API registers it with the relayer; the app checks both answers match. */
export async function depositAddress(account: string): Promise<string> {
  const onChain = await view<string>(CONNECTOR, 'get_user_deposit_address', { deposit_msg: { recipient_id: account } });
  try {
    const r = await fetch(`${OMNI}/api/v3/utxo/get_user_deposit_address`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: 'btc', recipient: account }) });
    if (r.ok) { const j = await r.json(); if (j.address && j.address !== onChain) throw new Error('Bridge API and connector disagree on the deposit address. Not sending.'); }
  } catch (e) { if (/disagree/.test((e as Error).message)) throw e; }
  return onChain;
}

export type OmniTransfer = { status: string; amount: string | null; initialised: { transaction_hash: string; timestamp_seconds: number } | null; finalised: { transaction_hash: string; timestamp_seconds: number } | null; utxo_meta: { relayer_fee: string | null; protocol_fee: string | null } | null };
export async function omniTransfer(txid: string, vout: number): Promise<OmniTransfer | null> {
  const r = await fetch(`${OMNI}/api/v4/transfers/transfer?utxo_chain=btc&utxo_tx_hash=${txid}&utxo_vout=${vout}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Bridge API HTTP ${r.status}`);
  const j = await r.json(); return (j.transfers?.[0] as OmniTransfer) || null;
}

export const nbtcBalance = (account: string) => view<string>(NBTC, 'ft_balance_of', { account_id: account });
export const useNbtcBalance = (account: string) => useLive<string>(account ? `nbtc:${account}` : null, () => nbtcBalance(account), 8000);
export const useNbtcVault = (id: string | undefined) => useLive<NbtcVault>(id && contractId ? `nbtcv:${id}` : null, () => view<NbtcVault>(contractId!, 'nbtc_vault', { token_id: id }), 8000);
export const useConnector = () => useLive<ConnectorConfig>('connector', () => view<ConnectorConfig>(CONNECTOR, 'get_config', {}), 300000);
export const useLightClient = () => useLive<{ block_height: number; block_hash: string }>('lightclient', () => view(LIGHT_CLIENT, 'get_last_block_header', {}), 30000);
export const useBtcTip = () => useLive<number>('btctip', btcTip, 20000);

export type BridgeStage = 'idle' | 'sent' | 'confirming' | 'verifying' | 'minted';
export type BridgeRun = { txid: string; vout: number; sats: number; address: string; account: string; at: number };
export type BridgeProgress = { stage: BridgeStage; confirmations: number; transfer: OmniTransfer | null; tx: EsploraTx | null };

/** Follows one deposit: Bitcoin confirmations from Esplora, then the connector's verify_deposit_v2 via the Omni API. */
export async function bridgeProgress(run: BridgeRun): Promise<BridgeProgress> {
  const [tx, tip] = await Promise.all([esplora<EsploraTx>(`/tx/${run.txid}`).catch(() => null), btcTip()]);
  const confirmations = tx?.status.confirmed && tx.status.block_height ? tip - tx.status.block_height + 1 : 0;
  const transfer = await omniTransfer(run.txid, run.vout).catch(() => null);
  const stage: BridgeStage = transfer?.finalised ? 'minted' : confirmations >= CONFIRMATIONS ? 'verifying' : confirmations > 0 ? 'confirming' : 'sent';
  return { stage, confirmations, transfer, tx };
}

const RUN_KEY = 'otzar.bridge.run';
export function savedRun(): BridgeRun | null { try { const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); return r && typeof r.txid === 'string' ? r : null; } catch { return null; } }
export function saveRun(r: BridgeRun | null) { try { if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r)); else localStorage.removeItem(RUN_KEY); } catch { /* per-tab convenience only */ } }

export const sats = (n: number | string | bigint) => Number(n).toLocaleString('en-US');
export const btc = (n: number | string | bigint, d = 8) => (Number(n) / 1e8).toFixed(d).replace(/0+$/, '').replace(/\.$/, '');
