import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,PublicKey,actions,nearToYocto,teraToGas} from 'near-api-js';
import {deriveAddresses,bitcoinScriptHex,newQuantumKey,signAuthorization,unsignedBitcoinSpend,rpcQuery} from '@hako/sdk';

const rpc='http://127.0.0.1:3030';const provider=new JsonRpcProvider({url:rpc});
const rootKey=JSON.parse(readFileSync(process.env.HAKO_ROOT_KEY_FILE||resolve('.demo/sandbox/validator_key.json'),'utf8'));
const root=new Account('test.near',provider,new KeyPairSigner(KeyPair.fromString(rootKey.secret_key)));
const record={network:'near sandbox + Bitcoin Core regtest',steps:[],bitcoin:{}};
async function send(actor,receiver,action,name,rejected=false){const r=await actor.signAndSendTransaction({receiverId:receiver,actions:Array.isArray(action)?action:[action],throwOnFailure:false,waitUntil:'FINAL'});const failed=!!r.status?.Failure;if(failed!==rejected)throw new Error(`${name}: ${failed?JSON.stringify(r.status.Failure):'attack accepted'}`);record.steps.push({name,txHash:r.transaction.hash,rejected});console.log(`${name}: ${failed?'rejected':'ok'} ${r.transaction.hash}`);return r;}
const call=(method,args,gas=120,deposit=0n)=>actions.functionCall(method,args,teraToGas(gas),deposit);
async function child(label){const key=KeyPair.fromRandom('ed25519');const id=`${label}.test.near`;await send(root,id,[actions.createAccount(),actions.transfer(nearToYocto('10')),actions.addFullAccessKey(PublicKey.fromString(key.getPublicKey().toString()))],`create ${label}`);return new Account(id,provider,new KeyPairSigner(key));}
async function btc(method,params=[],wallet=false){const cookie=readFileSync('.demo/bitcoin/regtest/.cookie','utf8').trim();const r=await fetch(`http://127.0.0.1:18443/${wallet?'wallet/hako-miner':''}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(cookie).toString('base64')}`},body:JSON.stringify({jsonrpc:'1.0',id:'calls-test',method,params})});const j=await r.json();if(!r.ok||j.error)throw new Error(`Bitcoin Core ${method}: ${JSON.stringify(j.error)}`);return j.result;}
async function main(){
  const contract=await child('hako-calls'),owner=await child('calls-owner'),buyer=await child('calls-buyer');
  await send(contract,contract.accountId,actions.deployContract(readFileSync('packages/contract/target/near/hako_contract.wasm')),'deploy covered-call contract');
  await send(contract,contract.accountId,call('new',{mpc_contract:'v1.signer-prod.testnet'}),'initialize covered-call contract');
  const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[],guardian:buyer.accountId,recovery_eth:'0x2222222222222222222222222222222222222222',emergency_migration:null};
  await send(owner,contract.accountId,call('mint',{token_id:'earn',policy}),'mint earn box');
  const pq=newQuantumKey();await send(owner,contract.accountId,call('register_pq_key',{token_id:'earn',key:Buffer.from(pq.publicKey).toString('base64')}),'register call writer ML-DSA key');
  const current=await deriveAddresses(contract.accountId,'earn',0);const next=await deriveAddresses(contract.accountId,'earn',1);
  const wallets=await btc('listwallets');if(!wallets.includes('hako-miner')){try{await btc('loadwallet',['hako-miner']);}catch{await btc('createwallet',['hako-miner']);}}
  const miner=await btc('getnewaddress',['miner','bech32'],true);const height=await btc('getblockcount');if(height<101)await btc('generatetoaddress',[101-height,miner]);
  const destination=await btc('getnewaddress',['buyer','bech32'],true);const script=bitcoinScriptHex(destination);
  const btcPolicy={daily_cap_sats:'10000000',allow_scripts:[script],recovery_script:script};
  const regPayload=Buffer.from(JSON.stringify([current.bitcoinPublicKey,next.bitcoinPublicKey,btcPolicy]));
  await send(owner,contract.accountId,call('register_btc',{token_id:'earn',current_pubkey_hex:current.bitcoinPublicKey,next_pubkey_hex:next.bitcoinPublicKey,policy:btcPolicy,nonce:0,signature:Buffer.from(signAuthorization(pq.secretKey,'earn',0,regPayload)).toString('base64')}),'register real Bitcoin key');
  const funding=await btc('sendtoaddress',[current.bitcoin,0.1],true);await btc('generatetoaddress',[1,miner]);
  const raw=await btc('getrawtransaction',[funding,true]);const vout=raw.vout.find(v=>v.scriptPubKey.address===current.bitcoin);if(!vout)throw new Error('funding output missing');
  const sats=BigInt(Math.round(vout.value*1e8));const outpoint=Buffer.concat([Buffer.from(funding,'hex').reverse(),Buffer.alloc(4)]);outpoint.writeUInt32LE(vout.n,32);
  record.bitcoin={fundingTx:funding,boxAddress:current.bitcoin,collateralSats:sats.toString(),outpoint:outpoint.toString('hex')};
  const expiry=Math.floor(Date.now()/1000)+3600;const args={token_id:'earn',strike_usd_e6:'100000000000',expiry_sec:expiry,size_sats:'100000',opening_premium_usdc:'100000000',minimum_premium_usdc:'20000000',collateral_outpoint_hex:outpoint.toString('hex'),collateral_sats:sats.toString(),nonce:1};
  const payload=Buffer.from(JSON.stringify([args.strike_usd_e6,args.expiry_sec,args.size_sats,args.opening_premium_usdc,args.minimum_premium_usdc,args.collateral_outpoint_hex,args.collateral_sats]));
  await send(owner,contract.accountId,call('write_call',{...args,signature:Buffer.from(signAuthorization(pq.secretKey,'earn',1,payload)).toString('base64')}),'write ML-DSA authorized covered call');
  const option=await rpcQuery(contract.accountId,'call_state',{token_id:'earn'},rpc);if(option.state!=='auction'||option.size_sats!=='100000')throw new Error('call state mismatch');
  const asking=BigInt(await rpcQuery(contract.accountId,'auction_price',{token_id:'earn'},rpc));if(asking>100000000n||asking<20000000n)throw new Error('Dutch auction price out of range');
  const spend=unsignedBitcoinSpend({txid:funding,vout:vout.n,prevoutSats:sats,destination,amountSats:sats-1000n,feeSats:1000n});const spendPayload=Buffer.concat([Buffer.from(spend.rawHex,'hex'),Buffer.alloc(8)]);spendPayload.writeBigUInt64LE(sats,spendPayload.length-8);
  await send(owner,contract.accountId,call('request_btc_spend',{token_id:'earn',raw_unsigned_hex:spend.rawHex,prevout_sats:sats.toString(),nonce:2,signature:Buffer.from(signAuthorization(pq.secretKey,'earn',2,spendPayload)).toString('base64')}),'encumbered BTC spend rejected',true);
  await send(owner,contract.accountId,call('nft_transfer',{receiver_id:buyer.accountId,token_id:'earn'},120,1n),'encumbered box transfer rejected',true);
  await send(owner,contract.accountId,call('list',{token_id:'earn',price:'10000000000000000000000'}),'encumbered box listing rejected',true);
  await send(owner,contract.accountId,call('close_unfilled_call',{token_id:'earn'}),'premature auction close rejected',true);
  writeFileSync('deployments/calls-sandbox.json',JSON.stringify(record,null,2)+'\n');console.log(`${record.steps.length} real-chain transactions; ${record.steps.filter(x=>x.rejected).length} rejected`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
