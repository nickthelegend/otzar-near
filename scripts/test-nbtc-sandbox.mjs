// nBTC vault on a local NEAR sandbox: lock, ML-DSA covered call, premium, quantum-gated withdraw, attacks.
// The sandbox stands in a local NEP-141 (packages/test-usdc) for nbtc.n-bridge.testnet, set with set_nbtc_token.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,PublicKey,actions,nearToYocto,teraToGas} from 'near-api-js';
import {randomBytes} from 'node:crypto';
import {newQuantumKey,signAuthorization,rpcQuery,relayerPublicKey} from '@hako/sdk';

const rpc='http://127.0.0.1:3030';const provider=new JsonRpcProvider({url:rpc});
const rootKey=JSON.parse(readFileSync(process.env.HAKO_ROOT_KEY_FILE||resolve('.demo/sandbox/validator_key.json'),'utf8'));
const root=new Account('test.near',provider,new KeyPairSigner(KeyPair.fromString(rootKey.secret_key)));
const record={network:'near sandbox',steps:[]};
async function send(actor,receiver,action,name,rejected=false,expect){const r=await actor.signAndSendTransaction({receiverId:receiver,actions:Array.isArray(action)?action:[action],throwOnFailure:false,waitUntil:'FINAL'});const fail=r.status?.Failure;const failed=!!fail;if(failed!==rejected)throw new Error(`${name}: ${failed?JSON.stringify(fail):'attack accepted'}`);if(expect&&!JSON.stringify(fail).includes(expect))throw new Error(`${name}: expected "${expect}", got ${JSON.stringify(fail)}`);record.steps.push({name,txHash:r.transaction.hash,rejected});console.log(`${name}: ${failed?'rejected':'ok'}`);return r;}
const call=(method,args,gas=150,deposit=0n)=>actions.functionCall(method,args,teraToGas(gas),deposit);
async function child(label){const key=KeyPair.fromRandom('ed25519');const id=`${label}.test.near`;await send(root,id,[actions.createAccount(),actions.transfer(nearToYocto('10')),actions.addFullAccessKey(PublicKey.fromString(key.getPublicKey().toString()))],`create ${label}`);return new Account(id,provider,new KeyPairSigner(key));}
const ft=(t,a)=>rpcQuery(t,'ft_balance_of',{account_id:a},rpc).then(BigInt);
const b64=u=>Buffer.from(u).toString('base64');
async function main(){
  const contract=await child('otzar-nbtc'),owner=await child('nbtc-owner'),buyer=await child('nbtc-buyer'),thief=await child('nbtc-thief');
  await send(contract,contract.accountId,[actions.deployContract(readFileSync('packages/contract/target/near/hako_contract.wasm')),call('new',{mpc_contract:'v1.signer-prod.testnet'})],'deploy Otzar');
  const nbtc=await child('nbtc'),usdc=await child('usdc');
  for(const t of [nbtc,usdc])await send(t,t.accountId,[actions.deployContract(readFileSync('packages/test-usdc/target/near/hako_test_usdc.wasm')),call('new',{},50)],`deploy local token ${t.accountId}`);
  for(const t of [nbtc,usdc])for(const a of [contract,owner,buyer,thief])await send(owner,t.accountId,call('storage_deposit',{account_id:a.accountId,registration_only:true},30,nearToYocto('0.00125')),`register ${a.accountId} on ${t.accountId}`);
  await send(nbtc,nbtc.accountId,call('mint',{account_id:owner.accountId,amount:'60000'}),'mint 60,000 sats of stand-in nBTC to owner');
  await send(nbtc,nbtc.accountId,call('mint',{account_id:thief.accountId,amount:'60000'}),'mint stand-in nBTC to thief');
  await send(usdc,usdc.accountId,call('mint',{account_id:buyer.accountId,amount:'1000000000'}),'mint tUSDC to buyer');
  await send(owner,contract.accountId,call('set_nbtc_token',{token:nbtc.accountId}),'non-contract nBTC config rejected',true);
  await send(contract,contract.accountId,[call('set_nbtc_token',{token:nbtc.accountId}),call('set_call_config',{premium_token:usdc.accountId,relayer_public_key:relayerPublicKey(randomBytes(32))})],'point at local nBTC + tUSDC');
  const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[],guardian:buyer.accountId,recovery_eth:'0x2222222222222222222222222222222222222222',emergency_migration:null};
  await send(owner,contract.accountId,call('mint',{token_id:'vault',policy}),'mint vault');
  const lock=(who,amt,id='vault')=>call('ft_transfer_call',{receiver_id:contract.accountId,amount:amt,msg:`lock:${id}`},150,1n);
  let before=await ft(nbtc.accountId,owner.accountId);
  await send(owner,nbtc.accountId,lock(owner,'45000'),'lock before ML-DSA key (refunded by NEP-141)');
  if(await ft(nbtc.accountId,owner.accountId)!==before)throw new Error('lock without key was not refunded');
  const pq=newQuantumKey();await send(owner,contract.accountId,call('register_pq_key',{token_id:'vault',key:b64(pq.publicKey)}),'register ML-DSA-65 key');
  await send(owner,nbtc.accountId,lock(owner,'45000'),'lock 45,000 sats nBTC');
  let v=await rpcQuery(contract.accountId,'nbtc_vault',{token_id:'vault'},rpc);if(v.balance_sats!=='45000'||await ft(nbtc.accountId,contract.accountId)!==45000n)throw new Error('lock not credited');
  before=await ft(nbtc.accountId,thief.accountId);await send(thief,nbtc.accountId,lock(thief,'1000'),'thief locks into someone else’s vault (refunded)');
  if(await ft(nbtc.accountId,thief.accountId)!==before)throw new Error('thief lock kept');
  // covered call on 30,000 sats, 7 days
  const expiry=Math.floor(Date.now()/1000)+7*86400;const args={token_id:'vault',strike_usd_e6:'100000000000',expiry_sec:expiry,size_sats:'30000',opening_premium_usdc:'2000000',minimum_premium_usdc:'1000000',nonce:0};
  const payload=Buffer.from(JSON.stringify(['nbtc',args.strike_usd_e6,args.expiry_sec,args.size_sats,args.opening_premium_usdc,args.minimum_premium_usdc]));
  await send(owner,contract.accountId,call('write_call_nbtc',{...args,size_sats:'50000',signature:b64(signAuthorization(pq.secretKey,'vault',0,payload))}),'call larger than locked nBTC rejected',true);
  await send(owner,contract.accountId,call('write_call_nbtc',{...args,signature:b64(signAuthorization(newQuantumKey().secretKey,'vault',0,payload))}),'call signed by the wrong ML-DSA key rejected',true,'bad ML-DSA signature');
  await send(owner,contract.accountId,call('write_call_nbtc',{...args,signature:b64(signAuthorization(pq.secretKey,'vault',0,payload))}),'write ML-DSA-signed covered call on nBTC');
  v=await rpcQuery(contract.accountId,'nbtc_vault',{token_id:'vault'},rpc);if(v.encumbered_sats!=='30000'||v.free_sats!=='15000')throw new Error('encumbrance wrong');
  const price=BigInt(await rpcQuery(contract.accountId,'auction_price',{token_id:'vault'},rpc));const w0=await ft(usdc.accountId,owner.accountId);
  await send(buyer,usdc.accountId,call('ft_transfer_call',{receiver_id:contract.accountId,amount:price.toString(),msg:'buy:vault'},150,1n),'buyer pays the premium');
  const earned=await ft(usdc.accountId,owner.accountId)-w0;if(earned!==price)throw new Error('premium not paid to owner');record.premium=earned.toString();
  // withdraw attacks and the real withdraw
  const wd=(amount,nonce,sig,receiver=owner.accountId)=>call('withdraw_nbtc',{token_id:'vault',receiver_id:receiver,amount,nonce,signature:sig},150,1n);
  await send(owner,contract.accountId,call('withdraw_nbtc',{token_id:'vault',receiver_id:owner.accountId,amount:'10000'},150,1n),'withdraw with the NEAR key only rejected',true,'quantum lock: ML-DSA signature required');
  await send(owner,contract.accountId,wd('10000',1,b64(randomBytes(3309))),'withdraw with a forged ML-DSA signature rejected',true,'bad ML-DSA signature');
  await send(owner,contract.accountId,wd('20000',1,b64(signAuthorization(pq.secretKey,'vault',1,Buffer.from(`withdraw-nbtc:v1:${owner.accountId}:20000`)))),'withdraw of call-backed nBTC rejected',true,'exceeds free nBTC');
  const good=b64(signAuthorization(pq.secretKey,'vault',1,Buffer.from(`withdraw-nbtc:v1:${owner.accountId}:10000`)));
  await send(owner,contract.accountId,wd('10000',1,good,thief.accountId),'signature replayed to another receiver rejected',true,'bad ML-DSA signature');
  await send(thief,contract.accountId,wd('10000',1,good),'non-owner withdraw rejected',true,'vault owner only');
  before=await ft(nbtc.accountId,owner.accountId);
  await send(owner,contract.accountId,wd('10000',1,good),'quantum-safe withdraw of 10,000 sats');
  if(await ft(nbtc.accountId,owner.accountId)-before!==10000n)throw new Error('withdraw not delivered');
  await send(owner,contract.accountId,wd('10000',1,good),'replayed withdraw rejected',true);
  await send(owner,contract.accountId,call('nft_transfer',{receiver_id:buyer.accountId,token_id:'vault'},120,1n),'vault transfer while call is live rejected',true);
  v=await rpcQuery(contract.accountId,'nbtc_vault',{token_id:'vault'},rpc);if(v.balance_sats!=='35000'||v.free_sats!=='5000')throw new Error('final balance wrong');
  writeFileSync('deployments/nbtc-sandbox.json',JSON.stringify(record,null,2)+'\n');console.log(`${record.steps.length} sandbox transactions; ${record.steps.filter(x=>x.rejected).length} rejected as expected`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
