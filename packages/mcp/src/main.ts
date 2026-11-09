import { readFileSync } from 'node:fs';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, teraToGas } from 'near-api-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  bitcoinAddress, bitcoinSighash, deriveAddresses, dryBitcoinQuote, ethBalance, rpcQuery, scanExposure, signAuthorization,
  solanaAddress, solanaBalance, solanaBlockhash, unsignedBitcoinSpend, unsignedEthTransfer, unsignedSolanaTransfer, verifyAuthorization,
} from '@hako/sdk';

const contractId = process.env.HAKO_CONTRACT_ID;
const nearRpc = 'https://test.rpc.fastnear.com';
const anvil = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';
const bitcoin = process.env.BITCOIN_ESPLORA_URL;
const solana = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';
if (!contractId) throw new Error('Setup required: HAKO_CONTRACT_ID');

async function evm(method: string, params: unknown[]) {
  const response = await fetch(anvil, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Anvil RPC HTTP ${response.status}`);
  const body = await response.json() as any;
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}
function account() {
  const id = process.env.NEAR_TESTNET_ACCOUNT;
  const key = process.env.NEAR_TESTNET_KEY;
  if (!id) throw new Error('Setup required: NEAR_TESTNET_ACCOUNT');
  if (!key) throw new Error('Setup required: NEAR_TESTNET_KEY');
  if (!id.endsWith('.testnet')) throw new Error('testnet account required');
  return new Account(id, new JsonRpcProvider({ url: nearRpc }), new KeyPairSigner(KeyPair.fromString(key as any)));
}
function quantumSecret() {
  const file = process.env.ML_DSA_KEY_FILE;
  if (!file) throw new Error('Setup required: ML_DSA_KEY_FILE');
  const key = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof key.secretKey !== 'string') throw new Error('invalid ML-DSA key file');
  return Buffer.from(key.secretKey, 'base64');
}
function authorize(box: any, data: Uint8Array): string {
  const signature = signAuthorization(quantumSecret(), box.token_id, box.nonce, data);
  if (!verifyAuthorization(Uint8Array.from(box.pq_key ?? []), signature, box.token_id, box.nonce, data)) throw new Error('ML_DSA_KEY_FILE does not match box');
  return Buffer.from(signature).toString('base64');
}
async function submit(method: string, args: object) {
  const actor = account();
  const result = await actor.signAndSendTransaction({ receiverId: contractId!, actions: [actions.functionCall(method, args, teraToGas(120), 0n)], throwOnFailure: false, waitUntil: 'FINAL' }) as any;
  if (result.status?.Failure) throw new Error(`NEAR rejected: ${JSON.stringify(result.status.Failure)}`);
  return { txHash: result.transaction.hash, explorer: `https://testnet.nearblocks.io/txns/${result.transaction.hash}` };
}
async function bitcoinUtxos(address: string): Promise<{txid:string,vout:number,sats:string}[]> {
  if (!bitcoin) throw new Error('Setup required: BITCOIN_ESPLORA_URL');
  const response = await fetch(`${bitcoin}/address/${address}`);
  if (!response.ok) throw new Error(`Bitcoin service HTTP ${response.status}`);
  const body = await response.json() as any;
  if (body.error) throw new Error(body.error);
  if (!Array.isArray(body.utxos)) throw new Error('Bitcoin service must expose live UTXOs');
  return body.utxos;
}

const server = new Server({ name: 'hako', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: 'box_info', description: 'Read a live Hako NFT, BTC and ETH addresses, policies, and pending requests.', inputSchema: { type: 'object', properties: { token_id: { type: 'string' } }, required: ['token_id'] } },
  { name: 'call_info', description: 'Read the live covered call, auction asking premium, and history for a box.', inputSchema: { type: 'object', properties: { token_id: { type: 'string' } }, required: ['token_id'] } },
  { name: 'dry_deposit_quote', description: 'Get a real 1Click dry quote from a supported origin asset into the box next epoch native BTC address. No swap or deposit address is created.', inputSchema: { type: 'object', properties: { token_id: { type: 'string' }, origin_asset: { type: 'string' }, amount: { type: 'string' }, refund_to: { type: 'string' } }, required: ['token_id', 'origin_asset', 'amount', 'refund_to'] } },
  { name: 'scan_exposure', description: 'Read live Bitcoin or Ethereum public-key exposure and native balance with no wallet.', inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } },
  { name: 'request_spend', description: 'Submit a Bitcoin, Ethereum, or local Solana spend through NEAR ML-DSA policy checks. Amount uses sats, wei, or lamports.', inputSchema: { type: 'object', properties: { token_id: { type: 'string' }, asset: { type: 'string', enum: ['bitcoin', 'ethereum', 'solana'] }, destination: { type: 'string' }, amount: { type: 'string' } }, required: ['token_id', 'asset', 'destination', 'amount'] } },
  { name: 'list_box', description: 'List an owned, unsigned box for testnet NEAR. The contract rejects pending spends.', inputSchema: { type: 'object', properties: { token_id: { type: 'string' }, price_yocto: { type: 'string' } }, required: ['token_id', 'price_yocto'] } },
] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const args = request.params.arguments as Record<string,string> || {};
    let result: unknown;
    if (request.params.name === 'scan_exposure') {
      result = await scanExposure(args.address ?? '');
    } else if (request.params.name === 'call_info') {
      result = {call:await rpcQuery(contractId!,'call_state',{token_id:args.token_id}),askingPremiumUsdc:await rpcQuery(contractId!,'auction_price',{token_id:args.token_id}),history:await rpcQuery(contractId!,'call_history',{token_id:args.token_id})};
    } else if (request.params.name === 'dry_deposit_quote') {
      const box=await rpcQuery(contractId!,'nft_token',{token_id:args.token_id});
      if(!box)throw new Error('box not found');
      const derived=await deriveAddresses(contractId!,args.token_id,box.epoch+1);
      const recipient=bitcoinAddress(Buffer.from(derived.bitcoinPublicKey,'hex'),'mainnet');
      result={recipient,quote:await dryBitcoinQuote({originAsset:args.origin_asset,amount:args.amount,recipient,refundTo:args.refund_to,jwt:process.env.ONECLICK_JWT})};
    } else if (request.params.name === 'box_info') {
      const box = await rpcQuery(contractId!, 'nft_token', { token_id: args.token_id });
      if (!box) throw new Error('box not found');
      const addresses = await deriveAddresses(contractId!, args.token_id, box.epoch);
      let ethBalanceWei: string;
      try { ethBalanceWei = (await ethBalance(addresses.ethereum, anvil)).toString(); }
      catch (error) { ethBalanceWei = `Setup required: ANVIL_RPC_URL (${(error as Error).message})`; }
      const solAddress = await solanaAddress(contractId!, args.token_id, box.epoch);
      let solBalanceLamports: string;
      try { solBalanceLamports = (await solanaBalance(solAddress, solana)).toString(); }
      catch (error) { solBalanceLamports = `Setup required: SOLANA_RPC_URL (${(error as Error).message})`; }
      result = { box, addresses: { ...addresses, solana: solAddress }, ethBalanceWei, solBalanceLamports, ethSpends: await rpcQuery(contractId!, 'spends_for_box', { token_id: args.token_id }), btcState: await rpcQuery(contractId!, 'btc_state', { token_id: args.token_id }), solState: await rpcQuery(contractId!, 'sol_state', { token_id: args.token_id }), guardians: await rpcQuery(contractId!, 'guardian_config', { token_id: args.token_id }), inheritance: await rpcQuery(contractId!, 'inheritance', { token_id: args.token_id }) };
    } else if (request.params.name === 'list_box') {
      if (!/^\d+$/.test(args.price_yocto ?? '')) throw new Error('price_yocto must be an integer');
      result = await submit('list', { token_id: args.token_id, price: args.price_yocto });
    } else if (request.params.name === 'request_spend') {
      if (!/^\d+$/.test(args.amount ?? '') || BigInt(args.amount) <= 0n) throw new Error('positive integer amount required');
      const box = await rpcQuery(contractId!, 'nft_token', { token_id: args.token_id });
      if (!box) throw new Error('box not found');
      const addresses = await deriveAddresses(contractId!, args.token_id, box.epoch);
      if (args.asset === 'ethereum') {
        if (!/^0x[0-9a-fA-F]{40}$/.test(args.destination ?? '')) throw new Error('invalid Ethereum destination');
        const nonce = Number(await evm('eth_getTransactionCount', [addresses.ethereum, 'pending']));
        const gasPrice = BigInt(await evm('eth_gasPrice', []));
        const raw = unsignedEthTransfer({ chainId: 31337, nonce, to: args.destination as `0x${string}`, value: BigInt(args.amount), maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice });
        result = { ...await submit('request_eth_spend', { token_id: args.token_id, raw_unsigned_hex: raw, nonce: box.nonce, signature: authorize(box, Buffer.from(raw.slice(2), 'hex')) }), unsignedTx: raw };
      } else if (args.asset === 'bitcoin') {
        const btc = await rpcQuery(contractId!, 'btc_state', { token_id: args.token_id });
        if (!btc) throw new Error('Setup required: register_btc');
        const next = await deriveAddresses(contractId!, args.token_id, btc.epoch + 1);
        if (btc.current_pubkey_hex !== addresses.bitcoinPublicKey || btc.next_pubkey_hex !== next.bitcoinPublicKey) throw new Error('Registered Bitcoin keys do not match MPC derivation');
        const utxos = await bitcoinUtxos(addresses.bitcoin);
        if (utxos.length !== 1) throw new Error(`one Bitcoin UTXO required; found ${utxos.length}`);
        const utxo = utxos[0];
        const prevout = BigInt(utxo.sats);
        const tx = unsignedBitcoinSpend({ txid: utxo.txid, vout: utxo.vout, prevoutSats: prevout, destination: args.destination, amountSats: BigInt(args.amount), feeSats: 1000n, changeAddress: next.bitcoin });
        if (bitcoinSighash(tx.rawHex, prevout, btc.current_pubkey_hex).length !== 64) throw new Error('Bitcoin sighash failed');
        const data = Buffer.concat([Buffer.from(tx.rawHex, 'hex'), Buffer.alloc(8)]);
        data.writeBigUInt64LE(prevout, data.length - 8);
        result = { ...await submit('request_btc_spend', { token_id: args.token_id, raw_unsigned_hex: tx.rawHex, prevout_sats: prevout.toString(), nonce: box.nonce, signature: authorize(box, data) }), unsignedTx: tx.rawHex };
      } else if (args.asset === 'solana') {
        const registered = await rpcQuery(contractId!, 'sol_state', { token_id: args.token_id });
        if (!registered) throw new Error('Setup required: register_sol');
        const source = await solanaAddress(contractId!, args.token_id, box.epoch);
        const raw = unsignedSolanaTransfer(source, args.destination, BigInt(args.amount), await solanaBlockhash(solana));
        result = { ...await submit('request_sol_spend', { token_id: args.token_id, message_hex: raw, nonce: box.nonce, signature: authorize(box, Buffer.from(raw, 'hex')) }), unsignedMessage: raw };
      } else throw new Error('asset must be bitcoin, ethereum, or solana');
    } else throw new Error(`unknown tool ${request.params.name}`);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
  }
});
await server.connect(new StdioServerTransport());
