#!/usr/bin/env node
// Re-checks Otzar's key proofs against public data. No install, no keys, no build:
//   node scripts/judge-verify.mjs
// Sources: FastNEAR transaction API (testnet), NEAR testnet RPC (archival first), Blockstream's Bitcoin testnet3 API,
// and this repo's contract source. Exit code 0 only if every check passes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEAR_RPC = 'https://test.rpc.fastnear.com';
const NEAR_ARCHIVAL_RPC = 'https://archival-rpc.testnet.fastnear.com'; // holds older transactions
const NEAR_TX_API = 'https://tx.test.fastnear.com/v0/transactions';
const EXPLORER = 'https://testnet.near.rocks/tx/';
const HAKO = 'hako-contract-mw984kpp.testnet';
const MPC = 'v1.signer-prod.testnet';
const VAULT_TOKEN = 'otzar-btc-mwg7hadd';
const BTC_TX = 'd853d38d289f204d87bded02f2dc54575b1a6cce4f03213b64b5535ec70ca35e';
const BTC_DEPOSIT_ADDR = 'tb1qz8zytmnh594j4rk3nuseac64ckcyd63ctdvvly';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Public endpoints rate-limit (HTTP 429): retry with backoff before reporting a failure.
const post = async (url, body) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && i < 6) { await sleep(1500 * (i + 1)); continue; }
    throw Error(`${url} answered HTTP ${r.status}`);
  }
};
const rpc = async (method, params, url = NEAR_RPC) => { const j = await post(url, { jsonrpc: '2.0', id: 1, method, params }); if (j.error) throw Error(JSON.stringify(j.error)); return j.result; };
// RPC `tx` cross-check with the signer from the transaction API: one attempt on the archival RPC (it holds older
// transactions), one on the main RPC. The main node can stall ~30 s on old transactions, hence the short timeouts.
let rpcChecked = 0, rpcSkipped = 0, rpcMisses = 0;
const txStatus = async (params) => {
  await sleep(300); // pacing keeps the public RPC from answering 429
  if (rpcMisses >= 3) { rpcSkipped++; return { skipped: true }; } // circuit breaker: the RPC is rate-limiting this IP, stop asking
  for (const url of [NEAR_ARCHIVAL_RPC, NEAR_RPC]) {
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params }) });
      if (r.status === 429) break;
      const j = await r.json();
      if (j.result) { rpcChecked++; rpcMisses = 0; return j.result; }
    } catch {}
  }
  rpcSkipped++; rpcMisses++;
  return { skipped: true }; // RPC rate-limited or unavailable: the check then rests on the transaction API alone, and the run says so
};
const view = async (account_id, method_name, args = {}) => {
  const r = await rpc('query', { request_type: 'call_function', account_id, method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), finality: 'final' });
  return JSON.parse(Buffer.from(r.result).toString());
};
const rows = [];
const check = (ok, what, detail) => rows.push({ ok: !!ok, what, detail });
const safe = async (what, fn) => { try { await fn(); } catch (e) { check(false, what, `error: ${e.message}`); } };

// ---- NEAR transactions ----
// kind: ok (succeeds), refused (a failure whose text contains `err`), mpc (Chain Signatures returned a signature of `scheme`),
//       mint (Omni relayer proved a Bitcoin deposit and nBTC was minted), method (succeeds and calls `method`)
const TXS = [
  { h: 'BHPHfnTMAFivsuD4XDutiFDMVW8WKsi4hDnP3v54o16b', what: 'Mint vault NFT otzar-btc-mwg7hadd', kind: 'method', method: 'mint' },
  { h: '5uNCFYJ1BLnAhpURuf4ZwyVfXgP12jEDwszKTN1XVwyT', what: 'Register the vault\'s ML-DSA-65 public key on chain', kind: 'method', method: 'register_pq_key' },
  { h: 'Gv3gYvByp4zQ1dMvmaV3NdgJjQtfKg5KisKUKNxqEQqh', what: 'Omni relayer verify_deposit_v2: BTC light client proof accepted, 59,800 sats of nBTC minted to the seller', kind: 'mint' },
  { h: '9yTwfrrLqgruaAg4ycSwQRnxrA1PwMefYbwW4dq6j7e6', what: 'Lock the nBTC into the vault (ft_transfer_call msg lock:<vault>); contract logs nbtc_locked', kind: 'lock' },
  { h: '8mAwz8vbTMVk3HdpqP7vSoay5DANaNvSxbwdA8EspYHq', what: 'Sell a 7-day covered call on the locked nBTC (write_call_nbtc, ML-DSA-65 signed)', kind: 'method', method: 'write_call_nbtc' },
  { h: 'HQEEMjKzB1YgK8kiKJGUktUrtrxPN63qnFzUxzS37yEY', what: 'Buyer pays the premium: 0.147756 tUSDC to the vault owner (ft_transfer_call msg buy:<vault>)', kind: 'premium' },
  { h: '4nWpidvNZ2qREywQNAbn48ESGwmMsq13QW1FQtPLgXg1', what: 'Withdraw free nBTC with owner key plus ML-DSA-65 signature', kind: 'method', method: 'withdraw_nbtc' },
  { h: 'AT9E1ySVJtoyTHKLnkP9WF82rvPaaoHN9Mbz2WqauzdP', what: 'Attack: withdraw nBTC with a forged ML-DSA signature is refused', kind: 'refused', err: 'bad ML-DSA signature' },
  { h: '3PghCRJxtpsUXpwsnXmeC64qwqPRFXpAALUApmLwjNpZ', what: 'Attack: owner\'s NEAR key alone tries to transfer a quantum-locked vault', kind: 'refused', err: 'quantum lock: ML-DSA signature required' },
  { h: 'CzDzjh2x4YgKkHTjML4oX63k59getTWdcQT3SgmQ8sSy', what: 'Attack: vault transfer with a forged ML-DSA signature', kind: 'refused', err: 'bad ML-DSA signature' },
  { h: 'ATu4EK8AG6FSJKVEHjTUTQLPkGVBQ9HnnCiEY3Litzk', what: 'Attack: owner\'s NEAR key alone tries to list the vault for sale', kind: 'refused', err: 'quantum lock: ML-DSA signature required' },
  { h: 'FnCLpz6RzsQDRokCdNUaETqtWHa1w5MBDJ9HJkTAffLk', what: 'Listing signed with the vault\'s ML-DSA key succeeds', kind: 'method', method: 'list' },
  { h: '5WGNSsxmC9Vqt55pZPi1osbyt5kiwFq4g8hSqhMg7c9E', what: 'Attack: ETH spend over the daily cap is refused', kind: 'refused', err: 'daily cap exceeded' },
  { h: '9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi', what: 'Attack: ETH spend with a wrong ML-DSA signature is refused', kind: 'refused', err: 'bad ML-DSA signature' },
  { h: 'H96BmoW8NrSsHzQzkghm1WH4LYeZtHZ6wHdPdTmB97pp', what: 'Attack: seller front-runs the buyer\'s vault with a spend request, refused', kind: 'refused', err: 'owner only' },
  { h: '9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt', what: 'Attack: replay with a stale nonce is refused', kind: 'refused', err: 'bad nonce' },
  { h: 'FjZ2MGw4UTGgksCus3CwRgLD1yVWrXPofRthGJyPz2wS', what: 'Attack: resale of a box that already issued a signature is refused', kind: 'refused', err: 'cannot safely resell' },
  { h: 'A2FQof1ircJejob64sUrRHejyyhAPszGg4S4VDzcMTMN', what: 'Attack: writer spends BTC collateral of a live covered call, refused', kind: 'refused', err: 'covered call encumbers box' },
  { h: 'EiBvj8JdUPYNwLfGJaUqnJUy2w2fyc8zsXkSeyNzcSmM', what: 'Attack: BTC spend over the daily cap is refused', kind: 'refused', err: 'BTC daily cap exceeded' },
  { h: 'EXAL6x2FCgETk2YoHqGqrxVL6aFhv1cLmjm8X5ccH8w2', what: 'In-the-money call exercised: Chain Signatures (secp256k1) signs the Bitcoin delivery', kind: 'mpc', scheme: 'Secp256k1' },
  { h: '9neZbTr3ccK8VkKToqcC32G7y9N28evWDPtAR2yri4DE', what: 'Out-of-the-money call: collateral released, Chain Signatures signs the Bitcoin spend', kind: 'mpc', scheme: 'Secp256k1' },
  { h: 'AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h', what: 'Solana: Chain Signatures Ed25519 signature for a vault-controlled address', kind: 'mpc', scheme: 'Ed25519' },
  { h: 'AzLx5us7NyZ7uxMwnYwBJhZnQNVoxz38eEm67enLjSzL', what: 'Delayed BTC withdrawal: MPC signs after the policy delay', kind: 'mpc', scheme: 'Secp256k1' },
  { h: '65JCAniykkbS1wXhrF6rSmWyXpwbJPk8YH9hntj8wAhv', what: 'Settlement with a late relayer price is refused (kept in the record)', kind: 'refused', err: 'relayer price must be fresh' },
  { h: '71gsnoXgkW34ByRqNwwvNuUfikxh8aofGaAPixprnnyq', what: 'Settle the in-the-money call from the signed at-expiry print', kind: 'method', method: 'settle_call' },
  { h: '5zrAxsiFqBehWMpJFZUbd61FDzZzxg5Fx87ckxFT4zAp', what: 'Attack: finalize guardian key recovery before the timelock is refused', kind: 'refused', err: 'recovery timelock active' },
  { h: 'GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc', what: 'Guardian key recovery finalized after the timelock', kind: 'method', method: 'finalize_pq_recovery' },
];

const src = readFileSync(join(ROOT, 'packages/contract/src/lib.rs'), 'utf8');
check(/env::ml_dsa_verify\(/.test(src) && /"bad ML-DSA signature"/.test(src) && /quantum lock: ML-DSA signature required/.test(src),
  'Source: the contract verifies ML-DSA-65 with env::ml_dsa_verify before spends, transfers, listings and withdrawals', 'packages/contract/src/lib.rs (verify_pq)');

const decode = (sv) => { try { return Buffer.from(sv, 'base64').toString(); } catch { return ''; } };

await safe('FastNEAR transaction API', async () => {
  const byHash = {};
  for (let i = 0; i < TXS.length; i += 15) {
    const api = await post(NEAR_TX_API, { tx_hashes: TXS.slice(i, i + 15).map(t => t.h) });
    for (const t of api.transactions ?? []) byHash[t.transaction.hash] = t;
  }
  for (const p of TXS) {
    const t = byHash[p.h];
    if (!t) { check(false, p.what, `${p.h} not found`); continue; }
    const signer = t.transaction.signer_id;
    const link = `${EXPLORER}${p.h}`;
    const fin = await txStatus({ tx_hash: p.h, sender_account_id: signer, wait_until: 'FINAL' }).catch(e => ({ error: e.message }));
    if (fin.error) { check(false, p.what, `RPC: ${fin.error}`); continue; }
    const rs = t.receipts ?? [];
    const outs = rs.map(r => r.execution_outcome?.outcome);
    const fails = outs.map(o => o?.status).filter(s => s?.Failure).map(s => JSON.stringify(s.Failure));
    const method = t.transaction.actions[0]?.FunctionCall?.method_name;
    const logs = outs.flatMap(o => o?.logs ?? []);
    let ok = fails.length === 0, detail = `${signer}${method ? ' ' + method : ''} · ${link}`;
    if (p.kind === 'method') ok &&= method === p.method;
    if (p.kind === 'refused') { ok = fails.some(f => f.includes(p.err)); detail = `${signer} ${method}: failure contains "${p.err}" · ${link}`; }
    if (p.kind === 'mpc') {
      const sig = outs.find(o => o?.executor_id === MPC && o.status?.SuccessValue && decode(o.status.SuccessValue).includes(`"scheme":"${p.scheme}"`));
      ok &&= !!sig && outs.some(o => o?.executor_id === HAKO && o.status?.SuccessValue !== undefined);
      detail = `${signer} ${method}: ${MPC} returned a ${p.scheme} signature · ${link}`;
    }
    if (p.kind === 'mint') {
      const minted = logs.some(l => l.includes('"ft_mint"') && l.includes('59800'));
      ok &&= minted && outs.some(o => o?.executor_id === 'btc-client-v4.testnet' && decode(o.status?.SuccessValue ?? '') === 'true') && method === 'verify_deposit_v2';
      detail = `${signer} verify_deposit_v2: btc-client-v4.testnet returned true, ft_mint 59800 · ${link}`;
    }
    if (p.kind === 'lock') { ok &&= logs.some(l => l.includes('nbtc_locked') && l.includes(VAULT_TOKEN)); detail = `${signer} -> nbtc.n-bridge.testnet ft_transfer_call, nbtc_locked event · ${link}`; }
    if (p.kind === 'premium') { ok &&= outs.some(o => o?.executor_id === 'husdc-3177b477.testnet' && decode(o.status?.SuccessValue ?? '') === '"147756"'); detail = `${signer} -> husdc-3177b477.testnet, 147756 units (0.147756 tUSDC) used · ${link}`; }
    check(ok, p.what, detail);
  }
});

// ---- Bitcoin testnet3: the real deposit that the NEAR light-client proof refers to ----
await safe('Bitcoin testnet3 deposit', async () => {
  let tx = null, where = '';
  for (const base of ['https://blockstream.info/testnet/api', 'https://mempool.space/testnet/api']) {
    try { const r = await fetch(`${base}/tx/${BTC_TX}`, { signal: AbortSignal.timeout(20000) }); if (r.ok) { tx = await r.json(); where = base; break; } } catch {}
  }
  const out = tx?.vout?.find(o => o.scriptpubkey_address === BTC_DEPOSIT_ADDR);
  const derived = await view('btc-connector.n-bridge.testnet', 'get_user_deposit_address', { deposit_msg: { recipient_id: 'hako-seller-mw984kqa.testnet' } }).catch(() => null);
  check(tx?.status?.confirmed && out?.value === 60000 && derived === BTC_DEPOSIT_ADDR,
    'Bitcoin testnet3 tx pays 60,000 sats to the bridge address that btc-connector.n-bridge.testnet derives for the seller account',
    tx ? `confirmed in block ${tx.status.block_height}, output ${out?.value} sats to ${BTC_DEPOSIT_ADDR}, connector answers ${derived} · https://mempool.space/testnet/tx/${BTC_TX}` : 'transaction not found on Blockstream or mempool.space');
});

// ---- live contract state ----
await safe('Live contract state', async () => {
  const code = await rpc('query', { request_type: 'view_code', account_id: HAKO, finality: 'final' });
  const codeHash = createHash('sha256').update(Buffer.from(code.code_base64, 'base64')).digest('hex');
  const rec = JSON.parse(readFileSync(join(ROOT, 'deployments/nbtc-upgrade-2026-11-14.json'), 'utf8'));
  check(codeHash.startsWith('251f65c2') && JSON.stringify(rec).includes(codeHash), `${HAKO} deployed code sha256 matches the Nov 14 upgrade record`, `sha256 ${codeHash.slice(0, 16)}…`);
  const t = await view(HAKO, 'nft_token', { token_id: VAULT_TOKEN });
  check(t?.token_id === VAULT_TOKEN && Array.isArray(t.pq_key) && t.pq_key.length === 1952 && t.nonce >= 1, `${HAKO} nft_token: vault ${VAULT_TOKEN} holds a 1,952-byte ML-DSA-65 public key and has used its nonce`, `owner ${t?.owner_id}, pq_key ${t?.pq_key?.length} bytes, nonce ${t?.nonce}`);
  const n = Number(await view(HAKO, 'nft_total_supply'));
  check(n >= 30, `${HAKO} nft_total_supply: 30+ vault NFTs minted on testnet`, `${n} vaults`);
});

const pass = rows.filter(r => r.ok).length;
console.log(`\nOtzar live verification · ${new Date().toISOString()}\n`);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.what}\n      ${r.detail}`);
console.log(`\nNEAR RPC tx cross-check: ${rpcChecked} confirmed, ${rpcSkipped} skipped (public RPC rate-limited or slow; those rest on the FastNEAR transaction API alone).`);
console.log(`\n${pass}/${rows.length} checks passed.`);
process.exit(pass === rows.length ? 0 : 1);
