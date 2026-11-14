#!/usr/bin/env node
// Otzar's Bitcoin testnet3 wallet (the network the NEAR Omni BTC connector uses).
// Creates a P2WPKH key once, stores it gitignored in .near-credentials/, and prints only the address + balance.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(root + 'packages/sdk/package.json');
const bitcoin = require('bitcoinjs-lib');
const { secp256k1 } = require('@noble/curves/secp256k1.js');

export const ESPLORA = 'https://blockstream.info/testnet/api';
export const NETWORK = bitcoin.networks.testnet;
const file = root + '.near-credentials/btc-testnet3-wallet.json';

export function loadWallet() {
  if (!existsSync(file)) {
    let sk; do { sk = randomBytes(32); } while (!secp256k1.utils.isValidSecretKey(sk));
    writeFileSync(file, JSON.stringify({ type: 'otzar-btc-testnet3-p2wpkh', secretKey: sk.toString('hex') }), { mode: 0o600 });
  }
  const sk = Buffer.from(JSON.parse(readFileSync(file, 'utf8')).secretKey, 'hex');
  const pubkey = Buffer.from(secp256k1.getPublicKey(sk, true));
  const pay = bitcoin.payments.p2wpkh({ pubkey, network: NETWORK });
  return { sk, pubkey, address: pay.address, output: pay.output };
}

export async function balance(address) {
  const r = await fetch(`${ESPLORA}/address/${address}`);
  if (!r.ok) throw new Error(`Esplora ${r.status}`);
  const j = await r.json();
  return { confirmed: j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum, pending: j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = loadWallet();
  console.log(JSON.stringify({ network: 'bitcoin-testnet3', address: w.address, ...(await balance(w.address)) }));
}
