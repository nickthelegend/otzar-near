import { address as bitcoinAddress, networks, script, opcodes } from 'bitcoinjs-lib';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type Exposure = { chain: 'bitcoin' | 'ethereum'; address: string; balance: string | null; exposed: boolean | null; reasons: string[]; source: string; scannedTransactions?: number };
const bitcoinApi = 'https://mempool.space/api';
const ethereumRpc = 'https://ethereum-rpc.publicnode.com';

async function json(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Chain API ${response.status} at ${url}`);
  return response.json();
}

async function scanBitcoinAt(address: string, api: string, scriptHash?: string, scriptHex?: string): Promise<Exposure> {
  if (!scriptHash) { try { bitcoinAddress.toOutputScript(address, networks.bitcoin); } catch { throw new Error('Enter a valid Bitcoin mainnet address or P2PK public key'); } }
  const base = api.replace(/\/$/, '');
  const endpoint = scriptHash ? `scripthash/${scriptHash}` : `address/${encodeURIComponent(address)}`;
  const state = await json(`${base}/${endpoint}`);
  const balance = BigInt(state.chain_stats.funded_txo_sum) - BigInt(state.chain_stats.spent_txo_sum) + BigInt(state.mempool_stats.funded_txo_sum) - BigInt(state.mempool_stats.spent_txo_sum);
  const count = Number(state.chain_stats.tx_count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid Bitcoin transaction count');
  const mempool = await json(`${base}/${endpoint}/txs/mempool`);
  const transactions: any[] = [...mempool];
  let last = '';
  do {
    const page: any[] = await json(`${base}/${endpoint}/txs/chain${last ? `/${last}` : ''}`);
    transactions.push(...page);
    if (page.length < 25) break;
    last = page[page.length - 1].txid;
  } while (transactions.length < count + mempool.length && transactions.length < 500);
  const complete = transactions.length >= count + Number(state.mempool_stats.tx_count);
  const outputs = transactions.flatMap(tx => tx.vout || []).filter(out => scriptHex ? out.scriptpubkey === scriptHex : out.scriptpubkey_address === address);
  const spent = transactions.some(tx => (tx.vin || []).some((vin: any) => scriptHex ? vin.prevout?.scriptpubkey === scriptHex : vin.prevout?.scriptpubkey_address === address));
  const taproot = address.toLowerCase().startsWith('bc1p');
  const p2pk = !!scriptHash || outputs.some(out => out.scriptpubkey_type === 'p2pk');
  const reused = outputs.length > 1;
  const reasons: string[] = [];
  if (taproot) reasons.push('Taproot output exposes an x-only public key in its output');
  if (p2pk) reasons.push('P2PK output contains the public key');
  if (scriptHash && outputs.length === 0) reasons.push('This indexer returned no P2PK outputs; balance cannot be verified here');
  if (spent) reasons.push('An earlier spend revealed the public key for this address');
  if (reused) reasons.push(`Address received ${outputs.length} outputs; reuse extends exposure`);
  if (!complete) reasons.push('History exceeds the 500-transaction scan limit; exposure may be incomplete');
  if (!reasons.length) reasons.push('No public key exposure found in the returned transaction history');
  return { chain: 'bitcoin', address, balance: scriptHash && outputs.length === 0 ? null : balance.toString(), exposed: taproot || p2pk || spent ? true : complete ? false : null, reasons, source: base, scannedTransactions: transactions.length };
}

export async function scanBitcoin(address: string, api = bitcoinApi): Promise<Exposure> {
  let scriptHash: string | undefined, scriptHex: string | undefined;
  if (/^(02|03)[0-9a-f]{64}$|^04[0-9a-f]{128}$/i.test(address)) {
    const pubkey=Buffer.from(address,'hex');
    secp256k1.Point.fromBytes(pubkey);
    const output=script.compile([pubkey,opcodes.OP_CHECKSIG]);
    scriptHex=Buffer.from(output).toString('hex');
    scriptHash=Buffer.from(sha256(output)).reverse().toString('hex');
  }
  try { return await scanBitcoinAt(address, api, scriptHash, scriptHex); }
  catch (error) {
    if (api !== bitcoinApi || (error as Error).message.startsWith('Enter a valid')) throw error;
    return scanBitcoinAt(address, 'https://blockstream.info/api', scriptHash, scriptHex);
  }
}

async function ethCall(url: string, method: string, address: string): Promise<string> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [address, 'latest'] }) });
  if (!response.ok) throw new Error(`Ethereum RPC ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`Ethereum RPC ${JSON.stringify(body.error)}`);
  if (typeof body.result !== 'string') throw new Error(`Ethereum RPC missing ${method}`);
  return body.result;
}

export async function scanEthereum(address: string, rpc = ethereumRpc): Promise<Exposure> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Enter a valid Ethereum address');
  const [nonceHex, balanceHex, code] = await Promise.all(['eth_getTransactionCount', 'eth_getBalance', 'eth_getCode'].map(method => ethCall(rpc, method, address)));
  const nonce = BigInt(nonceHex);
  const contract = code !== '0x';
  const reasons = contract ? ['Contract account: EOA public-key exposure does not apply'] : nonce > 0n ? [`Account nonce ${nonce} indicates activity; EIP-7702 can also raise nonce, so signed outgoing transactions are not proven by RPC state alone`] : ['No signed outgoing transaction indicated by the account nonce'];
  return { chain: 'ethereum', address, balance: BigInt(balanceHex).toString(), exposed: contract || nonce > 0n ? null : false, reasons, source: rpc };
}

export async function scanExposure(input: string): Promise<Exposure> {
  const address = input.trim();
  return address.startsWith('0x') ? scanEthereum(address) : scanBitcoin(address);
}
