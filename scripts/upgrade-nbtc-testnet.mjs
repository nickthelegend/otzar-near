import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,actions} from 'near-api-js';

const rpc='https://test.rpc.fastnear.com';const {id,key}=JSON.parse(readFileSync('.near-credentials/contract.json','utf8'));
const actor=new Account(id,new JsonRpcProvider({url:rpc}),new KeyPairSigner(KeyPair.fromString(key)));
const wasm=readFileSync('packages/contract/target/near/hako_contract.wasm');const localHash=createHash('sha256').update(wasm).digest('hex');
const tx=await actor.signAndSendTransaction({receiverId:id,actions:[actions.deployContract(wasm)],throwOnFailure:false,waitUntil:'FINAL'});
if(tx.status?.Failure)throw new Error(`NEAR deployment rejected: ${JSON.stringify(tx.status.Failure)}`);
const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'code',method:'query',params:{request_type:'view_code',finality:'final',account_id:id}})});
const body=await response.json();if(body.error)throw new Error(JSON.stringify(body.error));
const remoteHash=createHash('sha256').update(Buffer.from(body.result.code_base64,'base64')).digest('hex');if(remoteHash!==localHash)throw new Error('Deployed code hash differs from tested wasm');
const evidence={date:new Date().toISOString(),contract:id,wasmSha256:localHash,txHash:tx.transaction.hash,explorer:`https://testnet.nearblocks.io/txns/${tx.transaction.hash}`,verifiedAtBlock:body.result.block_height};
writeFileSync('deployments/nbtc-upgrade-2026-11-14.json',JSON.stringify(evidence,null,2)+'\n');console.log(`Verified nBTC vault upgrade: ${tx.transaction.hash} at block ${body.result.block_height}`);
