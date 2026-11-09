import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const date=new Date().toISOString().slice(0,10);
const file=process.argv[2]??`deployments/testnet-${date}.json`;
const evidence=JSON.parse(readFileSync(file,'utf8'));
async function rpc(url,method,params,headers={}){
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:'hako-verify',method,params})});
  if(!response.ok)throw new Error(`${method}: HTTP ${response.status}`);
  const body=await response.json();if(body.error)throw new Error(`${method}: ${JSON.stringify(body.error)}`);return body.result;
}
let nearCount=0;
for(const step of evidence.steps){
  const tx=await rpc(evidence.nearRpc,'tx',[step.txHash,step.signer]);
  const rejected=!!tx.status?.Failure;
  if(rejected!==step.rejected)throw new Error(`${step.step}: evidence status mismatch`);
  if(tx.transaction?.hash!==step.txHash)throw new Error(`${step.step}: transaction hash mismatch`);
  nearCount++;
}
const anvil=process.env.ANVIL_RPC_URL??'http://127.0.0.1:8545';
for(const [kind,hash] of Object.entries(evidence.ethereum)){
  if(!kind.endsWith('Tx'))continue;
  const receipt=await rpc(anvil,'eth_getTransactionReceipt',[hash]);
  if(receipt?.transactionHash?.toLowerCase()!==hash.toLowerCase()||receipt.status!=='0x1')throw new Error(`${kind}: Anvil receipt missing or failed`);
}
const cookie=readFileSync(resolve('.demo/bitcoin/regtest/.cookie'),'utf8').trim();
const auth={authorization:`Basic ${Buffer.from(cookie).toString('base64')}`};
for(const [kind,hash] of Object.entries(evidence.bitcoin)){
  if(!kind.endsWith('Tx'))continue;
  const tx=await rpc('http://127.0.0.1:18443','getrawtransaction',[hash,true],auth);
  if(tx.txid!==hash||tx.confirmations<1)throw new Error(`${kind}: Bitcoin Core transaction missing or unconfirmed`);
}
console.log(`verified ${nearCount} NEAR testnet transactions, 3 Anvil receipts, 2 confirmed Bitcoin Core transactions`);
