// Deploys tUSDC (Hako test), a no-value NEP-141, to a fresh testnet account funded by
// hako-seller (2 NEAR), mints test balances, and points Hako's covered calls at it.
// Keys are read from and written to the gitignored .near-credentials/ only; nothing is printed.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,actions,teraToGas,nearToYocto} from 'near-api-js';
import {relayerPublicKey} from '@hako/sdk';

const rpc=process.env.NEAR_RPC||'https://test.rpc.fastnear.com';const provider=new JsonRpcProvider({url:rpc});
const out=resolve('deployments/test-usdc-testnet-2026-11-09.json');
const prior=existsSync(out)?JSON.parse(readFileSync(out,'utf8')):null;
const record=prior||{date:new Date().toISOString(),network:'NEAR testnet',token:null,symbol:'tUSDC (Hako test)',note:'Test token for Hako covered calls. No value, no peg, not redeemable.',steps:[]};
const save=()=>writeFileSync(out,JSON.stringify(record,null,2)+'\n');
function account(label){const {id,key}=JSON.parse(readFileSync(resolve(`.near-credentials/${label}.json`),'utf8'));return new Account(id,provider,new KeyPairSigner(KeyPair.fromString(key)));}
const sleep=ms=>new Promise(d=>setTimeout(d,ms));
async function retry(fn){for(let i=0;;i++){try{return await fn();}catch(e){if(i<6&&/429|Rate limits/.test(String(e?.message||e)+String(e?.cause))){await sleep(5000*(i+1));continue;}throw e;}}}
async function send(actor,receiver,acts,name){const r=await retry(()=>actor.signAndSendTransaction({receiverId:receiver,actions:Array.isArray(acts)?acts:[acts],throwOnFailure:false,waitUntil:'FINAL'}));if(r.status?.Failure)throw new Error(`${name}: ${JSON.stringify(r.status.Failure)}`);record.steps.push({name,txHash:r.transaction.hash,explorer:`https://testnet.nearblocks.io/txns/${r.transaction.hash}`});save();console.log(`${name}: ${r.transaction.hash}`);return r;}
const call=(m,a,gas=60,dep=0n)=>actions.functionCall(m,a,teraToGas(gas),dep);
async function view(id,method,args={}){return retry(()=>view1(id,method,args));}
async function view1(id,method,args={}){const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'query',params:{request_type:'call_function',finality:'final',account_id:id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')}})});if(r.status===429)throw new Error('429');const j=await r.json();if(j.error||j.result?.error)throw new Error(`${method}: ${JSON.stringify(j.error||j.result.error)}`);return JSON.parse(Buffer.from(j.result.result).toString());}

const seller=account('seller'),buyer=account('buyer'),guardian=account('guardian'),contract=account('contract');
// 1. Token account
let tokenCred=resolve('.near-credentials/test-usdc.json');
if(!existsSync(tokenCred)){
  const id=`husdc-${randomBytes(4).toString('hex')}.testnet`;const key=KeyPair.fromRandom('ed25519');
  writeFileSync(tokenCred,JSON.stringify({id,key:key.toString()}),{mode:0o600});
  await send(seller,'testnet',call('create_account',{new_account_id:id,new_public_key:key.getPublicKey().toString()},100,nearToYocto('2')),`create ${id} (2 NEAR from ${seller.accountId})`);
}
const token=account('test-usdc');record.token=token.accountId;record.explorer=`https://testnet.nearblocks.io/address/${token.accountId}`;save();
// 2. Deploy + init
const wasm=readFileSync('packages/test-usdc/target/near/hako_test_usdc.wasm');record.wasmSha256=createHash('sha256').update(wasm).digest('hex');
const deployed=await view(token.accountId,'ft_metadata').then(()=>true,()=>false);
if(!deployed)await send(token,token.accountId,[actions.deployContract(wasm),call('new',{},50)],'deploy and init tUSDC (Hako test)');
const meta=await view(token.accountId,'ft_metadata');if(meta.symbol!=='tUSDC (Hako test)'||meta.decimals!==6)throw new Error('metadata mismatch');record.metadata=meta;save();
// 3. Register Hako accounts (contract must hold a balance entry to forward premiums)
for(const a of [contract,seller,guardian])if(!(await view(token.accountId,'storage_balance_of',{account_id:a.accountId})))await send(seller,token.accountId,call('storage_deposit',{account_id:a.accountId,registration_only:true},30,nearToYocto('0.00125')),`register ${a.accountId}`);
// 4. Test faucet mint to the buyer: 1,000,000 tUSDC (6 decimals)
if(BigInt(await view(token.accountId,'ft_balance_of',{account_id:buyer.accountId}))===0n)await send(token,token.accountId,call('mint',{account_id:buyer.accountId,amount:'1000000000000'}),`mint 1,000,000 tUSDC to ${buyer.accountId}`);
record.buyerBalance=await view(token.accountId,'ft_balance_of',{account_id:buyer.accountId});
// 5. Price relayer key (ed25519 seed stays in .near-credentials)
let relayerCred=resolve('.near-credentials/price-relayer.json');
if(!existsSync(relayerCred)){const seed=randomBytes(32);writeFileSync(relayerCred,JSON.stringify({publicKey:relayerPublicKey(seed),seed:seed.toString('base64')}),{mode:0o600});}
record.relayerPublicKey=JSON.parse(readFileSync(relayerCred,'utf8')).publicKey;save();
console.log(`tUSDC ${token.accountId}; buyer balance ${record.buyerBalance}`);
