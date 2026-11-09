import { readFileSync, writeFileSync } from 'node:fs';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, teraToGas } from 'near-api-js';
import { guardianConfigPayload, newQuantumKey, rpcQuery, signAuthorization, signGuardianApproval } from '@hako/sdk';

const provider=new JsonRpcProvider({url:'https://test.rpc.fastnear.com'});
function actor(name){const {id,key}=JSON.parse(readFileSync(`.near-credentials/${name}.json`,'utf8'));return new Account(id,provider,new KeyPairSigner(KeyPair.fromString(key)));}
const owner=actor('seller'),guardian=actor('guardian'),contract=actor('contract');
const tokenId=`recover-${Date.now().toString(36)}`;const steps=[];const file=`deployments/recovery-${new Date().toISOString().slice(0,10)}.json`;
function save(){writeFileSync(file,JSON.stringify({tokenId,contract:contract.accountId,steps},null,2)+'\n');}
async function send(who,method,args,expectFailure=false){const response=await who.signAndSendTransaction({receiverId:contract.accountId,actions:[actions.functionCall(method,args,teraToGas(120),0n)],throwOnFailure:false,waitUntil:'FINAL'});const rejected=!!response.status?.Failure;if(rejected!==expectFailure)throw new Error(`${method}: ${rejected?JSON.stringify(response.status.Failure):'attack accepted'}`);steps.push({method,rejected,txHash:response.transaction.hash,explorer:`https://testnet.nearblocks.io/txns/${response.transaction.hash}`});save();console.log(`${method}: ${rejected?'rejected':'ok'} ${response.transaction.hash}`);}
const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[],guardian:guardian.accountId,recovery_eth:'0x1111111111111111111111111111111111111111',emergency_migration:null};
await send(owner,'mint',{token_id:tokenId,policy});
const old=newQuantumKey(), next=newQuantumKey(), guardians=[newQuantumKey(),newQuantumKey(),newQuantumKey()];
const b64=b=>Buffer.from(b).toString('base64');
await send(owner,'register_pq_key',{token_id:tokenId,key:b64(old.publicKey)});
const configPayload=guardianConfigPayload(tokenId,guardians.map(k=>k.publicKey),2,120);
await send(owner,'set_guardians',{token_id:tokenId,keys:guardians.map(k=>b64(k.publicKey)),threshold:2,timelock_sec:120,nonce:0,signature:b64(signAuthorization(old.secretKey,tokenId,0,configPayload))});
const approval=k=>b64(signGuardianApproval(k.secretKey,tokenId,owner.accountId,0,next.publicKey));
await send(guardian,'initiate_pq_recovery',{token_id:tokenId,new_key:b64(next.publicKey),approvals:[approval(guardians[0]),'','']},true);
await send(guardian,'initiate_pq_recovery',{token_id:tokenId,new_key:b64(next.publicKey),approvals:[approval(guardians[0]),approval(guardians[1]),'']});
await send(guardian,'finalize_pq_recovery',{token_id:tokenId},true);
let configuration=await rpcQuery(contract.accountId,'guardian_config',{token_id:tokenId});
while(Date.now()*1e6 < configuration.ready_ns + 2_000_000_000){await new Promise(r=>setTimeout(r,5000));configuration=await rpcQuery(contract.accountId,'guardian_config',{token_id:tokenId});}
await send(guardian,'finalize_pq_recovery',{token_id:tokenId});
const box=await rpcQuery(contract.accountId,'nft_token',{token_id:tokenId});
if(b64(Uint8Array.from(box.pq_key))!==b64(next.publicKey))throw new Error('recovered authority key not stored');
const payload=Buffer.from('inheritance-cancel');
await send(owner,'cancel_inheritance',{token_id:tokenId,nonce:box.nonce,signature:b64(signAuthorization(old.secretKey,tokenId,box.nonce,payload))},true);
save();console.log('Recovery finalized and old key rejected');
