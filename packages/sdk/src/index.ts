import { sha3_256, keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import bs58 from 'bs58';
import { payments, networks, address as btcAddress, Transaction, script as btcScript, payments as btcPayments } from 'bitcoinjs-lib';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { serializeTransaction, parseTransaction, type TransactionSerializableEIP1559, type Hex } from 'viem';
import { Message, PublicKey, SystemProgram, Transaction as SolanaTransaction } from '@solana/web3.js';
export { scanBitcoin, scanEthereum, scanExposure, type Exposure } from './exposure.js';
export { oneClickTokens, dryBitcoinQuote, type OneClickAsset, type DryBitcoinQuoteInput } from './intents.js';
export { RELAYER_PRICE_LABEL, COINBASE_BTC_USD, usdToE6, fetchCoinbaseBtcUsd, relayerPriceMessage, signRelayerPrice, relayerPublicKey, type SpotPrint } from './relayer.js';

export const TESTNET_RPC = 'https://test.rpc.fastnear.com';
export const TESTNET_MPC = 'v1.signer-prod.testnet';
const EPSILON_PREFIX = 'near-mpc-recovery v0.1.0 epsilon derivation:';

export function path(tokenId: string, _chain: 'bitcoin' | 'ethereum', epoch = 0): string {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(tokenId)) throw new Error('invalid token id');
  return `hako/${tokenId}/${epoch}`;
}

export function derivePublicKey(rootNearKey: string, contractId: string, derivationPath: string): Uint8Array {
  if (!rootNearKey.startsWith('secp256k1:')) throw new Error('secp256k1 root required');
  const root = bs58.decode(rootNearKey.slice(10));
  if (root.length !== 64) throw new Error('invalid root key');
  const tweak = sha3_256(utf8ToBytes(`${EPSILON_PREFIX}${contractId},${derivationPath}`));
  const scalar = BigInt(`0x${bytesToHex(tweak)}`);
  if (scalar >= secp256k1.Point.Fn.ORDER) throw new Error('epsilon outside curve order');
  const child = secp256k1.Point.fromBytes(concatBytes(new Uint8Array([4]),root)).add(secp256k1.Point.BASE.multiply(scalar));
  return child.toBytes(true);
}

export function ethereumAddress(pubkey: Uint8Array): `0x${string}` {
  const uncompressed = secp256k1.Point.fromBytes(pubkey).toBytes(false).slice(1);
  return `0x${bytesToHex(keccak_256(uncompressed).slice(-20))}`;
}

export function bitcoinAddress(pubkey: Uint8Array, network: 'regtest'|'testnet4'|'mainnet' = 'regtest'): string {
  return payments.p2wpkh({pubkey: Buffer.from(pubkey), network: network === 'regtest' ? networks.regtest : network === 'testnet4' ? networks.testnet : networks.bitcoin}).address!;
}

export async function rpcQuery(accountId: string, method: string, args: object = {}, rpcUrl = TESTNET_RPC): Promise<any> {
  const req = {jsonrpc:'2.0',id:'hako',method:'query',params:{request_type:'call_function',finality:'final',account_id:accountId,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')}};
  let response = await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});
  // Public RPCs rate-limit bursts (HTTP 429); back off a few times before failing loudly.
  for (let i = 1; response.status === 429 && i <= 4; i++) { await new Promise(r => setTimeout(r, 1500 * i)); response = await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)}); }
  if (!response.ok) throw new Error(`NEAR RPC ${response.status}`);
  const json = await response.json() as any;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return JSON.parse(Buffer.from(json.result.result).toString());
}

export async function rootPublicKey(rpcUrl = TESTNET_RPC): Promise<string> { return rpcQuery(TESTNET_MPC,'public_key',{},rpcUrl); }

export async function deriveAddresses(contractId: string, tokenId: string, epoch = 0, rpcUrl = TESTNET_RPC) {
  const root = await rootPublicKey(rpcUrl);
  const ethPub = derivePublicKey(root,contractId,path(tokenId,'ethereum',epoch));
  const btcPub = derivePublicKey(root,contractId,path(tokenId,'bitcoin',epoch));
  return {ethereum:ethereumAddress(ethPub),bitcoin:bitcoinAddress(btcPub),ethereumPublicKey:bytesToHex(ethPub),bitcoinPublicKey:bytesToHex(btcPub)};
}

export async function verifyDerivation(contractId: string, derivationPath: string, rpcUrl = TESTNET_RPC): Promise<boolean> {
  const root = await rootPublicKey(rpcUrl);
  const local = derivePublicKey(root,contractId,derivationPath);
  const remote = await rpcQuery(TESTNET_MPC,'derived_public_key',{path:derivationPath,predecessor:contractId,domain_id:0},rpcUrl);
  const remoteBytes = bs58.decode((remote as string).replace('secp256k1:',''));
  return bytesToHex(secp256k1.Point.fromBytes(concatBytes(new Uint8Array([4]),remoteBytes)).toBytes(true)) === bytesToHex(local);
}

export function authorizationMessage(tokenId: string, nonce: number, request: Uint8Array): Uint8Array {
  const inner = bytesToHex(sha256(request));
  return sha256(utf8ToBytes(`hako:v1:${tokenId}:${nonce}:${inner}`));
}

export function newQuantumKey(): {publicKey: Uint8Array, secretKey: Uint8Array} { return ml_dsa65.keygen(); }
export function signAuthorization(secretKey: Uint8Array, tokenId: string, nonce: number, request: Uint8Array): Uint8Array { return ml_dsa65.sign(authorizationMessage(tokenId,nonce,request),secretKey); }
export function verifyAuthorization(publicKey: Uint8Array, signature: Uint8Array, tokenId: string, nonce: number, request: Uint8Array): boolean { return ml_dsa65.verify(signature,authorizationMessage(tokenId,nonce,request),publicKey); }

export function guardianConfigPayload(tokenId: string, keys: Uint8Array[], threshold: number, timelockSec: number): Uint8Array {
  return concatBytes(utf8ToBytes(`guardians:v1:${tokenId}:${threshold}:${timelockSec}:`), ...keys.map(key => sha256(key)));
}
export function recoveryMessage(tokenId: string, owner: string, nonce: number, newKey: Uint8Array): Uint8Array {
  return sha256(utf8ToBytes(`hako:recover:v1:${tokenId}:${owner}:${nonce}:${bytesToHex(sha256(newKey))}`));
}
export function signGuardianApproval(secretKey: Uint8Array, tokenId: string, owner: string, nonce: number, newKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(recoveryMessage(tokenId,owner,nonce,newKey), secretKey);
}
export function inheritancePayload(tokenId: string, heir: string, deadlineSec: number, delaySec: number): Uint8Array {
  return utf8ToBytes(`inheritance:v1:${tokenId}:${heir}:${deadlineSec}:${delaySec}`);
}
export async function solanaAddress(contractId: string, tokenId: string, epoch = 0, rpcUrl = TESTNET_RPC): Promise<string> {
  const derived = await rpcQuery(TESTNET_MPC, 'derived_public_key', { path: path(tokenId,'ethereum',epoch), predecessor: contractId, domain_id: 1 }, rpcUrl);
  if (typeof derived !== 'string' || !derived.startsWith('ed25519:')) throw new Error('Setup required: MPC_EDDSA_DOMAIN');
  const bytes = bs58.decode(derived.slice(8));
  if (bytes.length !== 32) throw new Error('Invalid MPC Ed25519 public key');
  return bs58.encode(bytes);
}

async function solanaRpc(method: string, params: unknown[], rpcUrl: string): Promise<any> {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Solana RPC ${response.status}`);
  const body = await response.json() as any;
  if (body.error) throw new Error(`Solana RPC ${JSON.stringify(body.error)}`);
  return body.result;
}

export async function solanaBalance(address: string, rpcUrl = 'http://127.0.0.1:8899'): Promise<bigint> {
  new PublicKey(address);
  const result = await solanaRpc('getBalance', [address, { commitment: 'confirmed' }], rpcUrl);
  return BigInt(result.value);
}

export async function solanaBlockhash(rpcUrl = 'http://127.0.0.1:8899'): Promise<string> {
  const result = await solanaRpc('getLatestBlockhash', [{ commitment: 'confirmed' }], rpcUrl);
  return result.value.blockhash;
}

export function unsignedSolanaTransfer(source: string, destination: string, lamports: bigint, recentBlockhash: string): string {
  if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid SOL amount');
  const fromPubkey = new PublicKey(source);
  const toPubkey = new PublicKey(destination);
  if (fromPubkey.equals(toPubkey)) throw new Error('source and destination match');
  const tx = new SolanaTransaction({ feePayer: fromPubkey, recentBlockhash });
  tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports: Number(lamports) }));
  const message = tx.serializeMessage();
  if (message.length !== 150) throw new Error('simple Solana transfer message required');
  return bytesToHex(message);
}

export function signedSolanaTransaction(messageHex: string, mpcResponse: string, source: string): string {
  const response = JSON.parse(mpcResponse);
  if (response.scheme !== 'Ed25519' || !Array.isArray(response.signature) || response.signature.length !== 64) throw new Error('invalid MPC Ed25519 signature');
  const signature = Uint8Array.from(response.signature);
  const messageBytes = Buffer.from(messageHex, 'hex');
  const sourceBytes = new PublicKey(source).toBytes();
  if (!ed25519.verify(signature, messageBytes, sourceBytes)) throw new Error('MPC signature does not verify for Solana source');
  const message = Message.from(messageBytes);
  if (!message.accountKeys[0].equals(new PublicKey(source))) throw new Error('Solana source mismatch');
  return SolanaTransaction.populate(message, [bs58.encode(signature)]).serialize().toString('base64');
}

export async function broadcastSolana(signedBase64: string, rpcUrl = 'http://127.0.0.1:8899'): Promise<string> {
  return solanaRpc('sendTransaction', [signedBase64, { encoding: 'base64', preflightCommitment: 'confirmed' }], rpcUrl);
}

export function unsignedEthTransfer(input: {chainId:31337|11155111, nonce:number, to:`0x${string}`, value:bigint, maxFeePerGas:bigint, maxPriorityFeePerGas:bigint}): Hex {
  return serializeTransaction({type:'eip1559',chainId:input.chainId,nonce:input.nonce,to:input.to,value:input.value,gas:21000n,maxFeePerGas:input.maxFeePerGas,maxPriorityFeePerGas:input.maxPriorityFeePerGas,accessList:[]});
}

export function signedEthTransaction(unsigned: Hex, mpcResponse: string): Hex {
  const response = JSON.parse(mpcResponse);
  if (response.scheme !== 'Secp256k1') throw new Error('MPC returned another signature scheme');
  const point = response.big_r?.affine_point;
  const scalar = response.s?.scalar;
  if (!/^(02|03)[0-9a-f]{64}$/i.test(point) || !/^[0-9a-f]{64}$/i.test(scalar)) throw new Error('invalid MPC signature');
  const r = BigInt(`0x${point.slice(2)}`);
  const s = BigInt(`0x${scalar}`);
  const yParity = Number(response.recovery_id) % 2;
  if (!Number.isInteger(response.recovery_id) || response.recovery_id < 0 || response.recovery_id > 3) throw new Error('invalid MPC recovery id');
  const tx = parseTransaction(unsigned) as TransactionSerializableEIP1559;
  return serializeTransaction(tx,{r:`0x${r.toString(16)}`,s:`0x${s.toString(16)}`,yParity});
}

export async function ethBalance(address: string, rpcUrl = 'http://127.0.0.1:8545'): Promise<bigint> {
  const response = await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[address,'latest']})});
  if (!response.ok) throw new Error(`ETH RPC ${response.status}`);
  const result = await response.json() as any; if (result.error) throw new Error(JSON.stringify(result.error)); return BigInt(result.result);
}

export async function broadcastEth(signed: Hex, rpcUrl = 'http://127.0.0.1:8545'): Promise<string> {
  const response = await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendRawTransaction',params:[signed]})});
  if (!response.ok) throw new Error(`ETH RPC ${response.status}`);
  const result = await response.json() as any; if (result.error) throw new Error(JSON.stringify(result.error)); return result.result;
}

export function bitcoinScriptHex(address: string, network: 'regtest'|'testnet4'='regtest'): string {
  return bytesToHex(btcAddress.toOutputScript(address,network==='regtest'?networks.regtest:networks.testnet));
}
export function bitcoinAddressFromScript(scriptHex:string,network:'regtest'|'testnet4'='regtest'):string {return btcAddress.fromOutputScript(Buffer.from(scriptHex,'hex'),network==='regtest'?networks.regtest:networks.testnet);}
export function bitcoinPrevout(unsignedHex:string):{txid:string,vout:number}{const tx=Transaction.fromHex(unsignedHex);if(tx.ins.length!==1)throw new Error('one input required');return {txid:Buffer.from(tx.ins[0].hash).reverse().toString('hex'),vout:tx.ins[0].index};}

export function unsignedBitcoinSpend(input:{txid:string,vout:number,prevoutSats:bigint,destination:string,amountSats:bigint,changeAddress?:string,feeSats:bigint,network?:'regtest'|'testnet4'}):{rawHex:string,prevoutSats:bigint} {
  const network=input.network==='testnet4'?networks.testnet:networks.regtest;
  if(!/^[0-9a-f]{64}$/i.test(input.txid))throw new Error('invalid txid');
  if(input.amountSats<=0n||input.feeSats<=0n||input.prevoutSats<input.amountSats+input.feeSats)throw new Error('invalid Bitcoin amounts');
  const tx=new Transaction();tx.version=2;tx.addInput(Buffer.from(input.txid,'hex').reverse(),input.vout,0xfffffffd);
  tx.addOutput(btcAddress.toOutputScript(input.destination,network),input.amountSats);
  const change=input.prevoutSats-input.amountSats-input.feeSats;
  if(change>0n){if(!input.changeAddress)throw new Error('next epoch change address required');if(change<546n)throw new Error('change below dust threshold');tx.addOutput(btcAddress.toOutputScript(input.changeAddress,network),change);}
  return {rawHex:tx.toHex(),prevoutSats:input.prevoutSats};
}

export function signedBitcoinTransaction(unsignedHex:string,mpcResponse:string,compressedPublicKeyHex:string):string {
  const response=JSON.parse(mpcResponse);
  if(response.scheme!=='Secp256k1')throw new Error('MPC returned another signature scheme');
  const point=response.big_r?.affine_point;const scalar=response.s?.scalar;
  if(!/^(02|03)[0-9a-f]{64}$/i.test(point)||!/^[0-9a-f]{64}$/i.test(scalar))throw new Error('invalid MPC signature');
  if(!/^(02|03)[0-9a-f]{64}$/i.test(compressedPublicKeyHex))throw new Error('invalid Bitcoin public key');
  const tx=Transaction.fromHex(unsignedHex);
  if(tx.ins.length!==1||tx.ins[0].witness.length)throw new Error('one unsigned input required');
  const compact=concatBytes(Buffer.from(point.slice(2),'hex'),Buffer.from(scalar,'hex'));
  tx.ins[0].witness=[btcScript.signature.encode(compact,Transaction.SIGHASH_ALL),Buffer.from(compressedPublicKeyHex,'hex')];
  return tx.toHex();
}

export function bitcoinSighash(unsignedHex:string,prevoutSats:bigint,compressedPublicKeyHex:string):string {
  const tx=Transaction.fromHex(unsignedHex);
  if(tx.ins.length!==1)throw new Error('one input required');
  const p2wpkh=btcPayments.p2wpkh({pubkey:Buffer.from(compressedPublicKeyHex,'hex'),network:networks.regtest});
  const scriptCode=btcPayments.p2pkh({hash:p2wpkh.hash}).output;
  if(!scriptCode)throw new Error('P2WPKH script unavailable');
  return bytesToHex(tx.hashForWitnessV0(0,scriptCode,prevoutSats,Transaction.SIGHASH_ALL));
}
