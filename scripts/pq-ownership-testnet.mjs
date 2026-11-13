// Upgrade the testnet contract to quantum-locked ownership (nft_transfer and list need the vault's ML-DSA
// signature once a key is registered), verify the deployed code hash, then prove it live on a vault this repo owns:
// a classical-key-only transfer and a forged ML-DSA transfer are rejected, and an ML-DSA-signed listing succeeds
// (then is withdrawn). Keys are read from the ignored .near-credentials/ directory and never printed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, teraToGas } from 'near-api-js';
import { newQuantumKey, signAuthorization, verifyAuthorization } from '@hako/sdk';

const rpc = process.env.NEAR_RPC || 'https://test.rpc.fastnear.com';
const provider = new JsonRpcProvider({ url: rpc });
const account = name => { const { id, key } = JSON.parse(readFileSync(`.near-credentials/${name}.json`, 'utf8')); return new Account(id, provider, new KeyPairSigner(KeyPair.fromString(key))); };
const contract = account('contract'), seller = account('seller'), buyer = account('buyer');
const vault = process.env.PQ_VAULT || 'call-mw9c9f1x';
const evidence = { date: new Date().toISOString(), network: 'NEAR testnet', contract: contract.accountId, vault, steps: [] };
async function query(params) { const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'pq', method: 'query', params: { finality: 'final', ...params } }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; }
const view = async (method, args) => JSON.parse(Buffer.from((await query({ request_type: 'call_function', account_id: contract.accountId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') })).result).toString());
async function send(actor, method, args, name, expectFailure, deposit = 0n) {
  const r = await actor.signAndSendTransaction({ receiverId: contract.accountId, actions: [actions.functionCall(method, args, teraToGas(60), deposit)], throwOnFailure: false, waitUntil: 'FINAL' });
  const failure = r.status?.Failure ? JSON.stringify(r.status.Failure) : '';
  const panic = failure.match(/Smart contract panicked: ([^"\\]+)/)?.[1] || failure.slice(0, 160);
  if (!!failure !== expectFailure) throw new Error(`${name}: ${failure ? panic : 'unexpectedly accepted'}`);
  const step = { name, method, signer: actor.accountId, rejected: !!failure, reason: panic || null, txHash: r.transaction.hash, explorer: `https://testnet.nearblocks.io/txns/${r.transaction.hash}` };
  evidence.steps.push(step); console.log(`${name}: ${failure ? `rejected (${panic})` : 'ok'} ${r.transaction.hash}`);
  writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
  return step;
}
const out = `deployments/pq-ownership-${evidence.date.slice(0, 10)}.json`;

if (process.env.SKIP_DEPLOY !== '1') {
  const wasm = readFileSync('packages/contract/target/near/hako_contract.wasm');
  const localHash = createHash('sha256').update(wasm).digest('hex');
  const tx = await contract.signAndSendTransaction({ receiverId: contract.accountId, actions: [actions.deployContract(wasm)], throwOnFailure: false, waitUntil: 'FINAL' });
  if (tx.status?.Failure) throw new Error(`NEAR deployment rejected: ${JSON.stringify(tx.status.Failure)}`);
  const code = await query({ request_type: 'view_code', account_id: contract.accountId });
  const remoteHash = createHash('sha256').update(Buffer.from(code.code_base64, 'base64')).digest('hex');
  if (remoteHash !== localHash) throw new Error('Deployed code hash differs from the tested wasm');
  evidence.upgrade = { txHash: tx.transaction.hash, explorer: `https://testnet.nearblocks.io/txns/${tx.transaction.hash}`, wasmSha256: localHash, verifiedAtBlock: code.block_height };
  console.log(`Upgraded and verified ${localHash} in ${tx.transaction.hash}`);
  writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
}

const box = await view('nft_token', { token_id: vault });
if (!box || box.owner_id !== seller.accountId || !box.pq_key || box.ever_signed) throw new Error(`${vault} is not an unsigned, quantum-locked vault owned by ${seller.accountId}`);
const key = JSON.parse(readFileSync(`.near-credentials/${vault}-pq.json`, 'utf8'));
const secret = Buffer.from(key.secretKey, 'base64');
const sign = (sk, text, nonce = box.nonce) => Buffer.from(signAuthorization(sk, vault, nonce, Buffer.from(text))).toString('base64');
const probe = Buffer.from('probe');
if (!verifyAuthorization(Uint8Array.from(box.pq_key), signAuthorization(secret, vault, box.nonce, probe), vault, box.nonce, probe)) throw new Error('Saved ML-DSA key does not match the vault');

await send(seller, 'nft_transfer', { receiver_id: buyer.accountId, token_id: vault }, 'Owner NEAR key alone tries to transfer the vault', true, 1n);
await send(seller, 'nft_transfer', { receiver_id: buyer.accountId, token_id: vault, nonce: box.nonce, signature: sign(newQuantumKey().secretKey, `transfer:v1:${buyer.accountId}`) }, 'Transfer with a forged ML-DSA signature', true, 1n);
await send(seller, 'list', { token_id: vault, price: '1000000000000000000000' }, 'Owner NEAR key alone tries to list the vault for sale', true);
const listed = await send(seller, 'list', { token_id: vault, price: '1000000000000000000000', nonce: box.nonce, signature: sign(secret, 'list:v1:1000000000000000000000') }, 'Listing signed with the vault ML-DSA key', false);
await send(seller, 'unlist', { token_id: vault }, 'Withdraw the listing', false);
const after = await view('nft_token', { token_id: vault });
if (after.owner_id !== seller.accountId || after.nonce !== box.nonce + 1 || after.listed_yocto !== null) throw new Error('Unexpected vault state after the live checks');
evidence.after = { owner: after.owner_id, nonce: after.nonce, listed: after.listed_yocto };
writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
console.log(`Recorded ${evidence.steps.length} live steps in ${out}; listing tx ${listed.txHash}`);
