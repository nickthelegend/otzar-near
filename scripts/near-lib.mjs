// Shared testnet helpers for Hako scripts. Keys are read from gitignored .near-credentials/ only.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,actions,teraToGas} from 'near-api-js';

export const rpc=process.env.NEAR_RPC||'https://test.rpc.fastnear.com';
export const provider=new JsonRpcProvider({url:rpc});
export const explorer=hash=>`https://testnet.nearblocks.io/txns/${hash}`;
export const sleep=ms=>new Promise(d=>setTimeout(d,ms));
export function account(label){const {id,key}=JSON.parse(readFileSync(resolve(`.near-credentials/${label}.json`),'utf8'));return new Account(id,provider,new KeyPairSigner(KeyPair.fromString(key)));}
export const call=(method,args,gas=120,deposit=0n)=>actions.functionCall(method,args,teraToGas(gas),deposit);
export async function retry(fn){for(let i=0;;i++){try{return await fn();}catch(e){if(i<6&&/429|Rate limits/.test(String(e?.message||e)+String(e?.cause))){await sleep(5000*(i+1));continue;}throw e;}}}
/** Sends one transaction and records it. `rejected` marks an attack that must fail on-chain. */
export function sender(record,save,log=console.log){
  return async function send(actor,receiver,acts,name,rejected=false){
    const r=await retry(()=>actor.signAndSendTransaction({receiverId:receiver,actions:Array.isArray(acts)?acts:[acts],throwOnFailure:false,waitUntil:'FINAL'}));
    const failed=!!r.status?.Failure;
    const step={name,txHash:r.transaction.hash,explorer:explorer(r.transaction.hash),rejected};
    if(failed)step.error=JSON.stringify(r.status.Failure).slice(0,300);
    record.steps.push(step);save();
    if(failed!==rejected)throw new Error(`${name}: ${failed?step.error:'attack accepted'}`);
    log(`${name}: ${failed?'rejected':'ok'} ${r.transaction.hash}`);return r;
  };
}
export async function codeHash(accountId){const r=await retry(async()=>{const x=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'code',method:'query',params:{request_type:'view_code',finality:'final',account_id:accountId}})});if(x.status===429)throw new Error('429');return x.json();});if(r.error)throw new Error(JSON.stringify(r.error));return {code:Buffer.from(r.result.code_base64,'base64'),block:r.result.block_height};}
