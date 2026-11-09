// Upgrades hako-contract-mw984kpp.testnet to the relayer-price wasm (state is kept: calls live in
// raw storage and the new field is serde-defaulted), verifies the on-chain code hash, then points
// new calls at tUSDC (Hako test) and sets the relayer key, and posts one real relayer price.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rpcQuery} from '@hako/sdk';
import {account,call,sender,codeHash} from './near-lib.mjs';
import {actions} from 'near-api-js';
import {relayPrice} from './price-relayer.mjs';

const out=process.argv[2]||'deployments/relayer-upgrade-2026-11-09.json';const record={date:new Date().toISOString(),network:'NEAR testnet',steps:[]};
const save=()=>writeFileSync(out,JSON.stringify(record,null,2)+'\n');const send=sender(record,save);
const contract=account('contract'),poster=account('guardian');
const token=JSON.parse(readFileSync('.near-credentials/test-usdc.json','utf8')).id;
const relayerKey=JSON.parse(readFileSync('.near-credentials/price-relayer.json','utf8')).publicKey;
const before=await rpcQuery(contract.accountId,'call_state',{token_id:'call-mw9c9f1x'});record.existingCallBefore={token_id:'call-mw9c9f1x',state:before?.state,writer:before?.writer};
const wasm=readFileSync('packages/contract/target/near/hako_contract.wasm');const local=createHash('sha256').update(wasm).digest('hex');
await send(contract,contract.accountId,actions.deployContract(wasm),'upgrade Hako to relayer-price contract');
const {code,block}=await codeHash(contract.accountId);const remote=createHash('sha256').update(code).digest('hex');
if(remote!==local)throw new Error('deployed code hash differs from tested wasm');record.wasmSha256=local;record.verifiedAtBlock=block;save();
const after=await rpcQuery(contract.accountId,'call_state',{token_id:'call-mw9c9f1x'});if(after?.state!==before?.state||after?.writer!==before?.writer)throw new Error('existing call state changed across upgrade');record.existingCallAfter={state:after.state,premium_token:after.premium_token??null};
await send(contract,contract.accountId,call('set_call_config',{premium_token:token,relayer_public_key:relayerKey},30),'set tUSDC premium token and relayer key');
record.config=await rpcQuery(contract.accountId,'call_config',{});save();
const p=await relayPrice({send,poster,contractId:contract.accountId,name:'first relayer BTC-USD price'});record.firstPrice=p.print;
record.stored=await rpcQuery(contract.accountId,'relayer_price',{});save();
console.log(`upgraded (sha256 ${local}); premium token ${record.config.premium_token}; relayer price ${p.print.price}`);
