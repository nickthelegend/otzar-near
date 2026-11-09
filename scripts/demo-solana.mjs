import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, teraToGas } from 'near-api-js';
import { broadcastSolana, newQuantumKey, rpcQuery, signAuthorization, signedSolanaTransaction, solanaAddress, solanaBalance, solanaBlockhash, unsignedSolanaTransfer } from '@hako/sdk';

const nearRpc='https://test.rpc.fastnear.com';const solRpc='http://127.0.0.1:8899';
const credential='.near-credentials/seller.json';const contractCredential='.near-credentials/contract.json';
if(!existsSync(credential)||!existsSync(contractCredential))throw new Error('Setup required: run scripts/demo.sh first to create ignored testnet credentials');
const provider=new JsonRpcProvider({url:nearRpc});
function actor(file){const {id,key}=JSON.parse(readFileSync(file,'utf8'));return new Account(id,provider,new KeyPairSigner(KeyPair.fromString(key)));}
const seller=actor(credential),contract=actor(contractCredential);const steps=[];
async function send(who,method,args,deposit=0n,expectedFailure=false){const response=await who.signAndSendTransaction({receiverId:contract.accountId,actions:[actions.functionCall(method,args,teraToGas(120),deposit)],throwOnFailure:false,waitUntil:'FINAL'});const rejected=!!response.status?.Failure;if(rejected!==expectedFailure)throw new Error(`${method}: ${rejected?JSON.stringify(response.status.Failure):'attack accepted'}`);const hash=response.transaction.hash;steps.push({action:method,rejected,txHash:hash,explorer:`https://testnet.nearblocks.io/txns/${hash}`});console.log(`${method}: ${rejected?'rejected':'ok'} ${hash}`);return response;}
async function sol(method,params){const response=await fetch(solRpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!response.ok)throw new Error(`Solana RPC ${response.status}`);const body=await response.json();if(body.error)throw new Error(JSON.stringify(body.error));return body.result;}
const wasm=readFileSync('packages/contract/target/near/hako_contract.wasm');
const deployment=await contract.signAndSendTransaction({receiverId:contract.accountId,actions:[actions.deployContract(wasm)],throwOnFailure:false,waitUntil:'FINAL'});
if(deployment.status?.Failure)throw new Error(JSON.stringify(deployment.status.Failure));
steps.push({action:'upgrade Hako for Solana',rejected:false,txHash:deployment.transaction.hash,explorer:`https://testnet.nearblocks.io/txns/${deployment.transaction.hash}`});
const tokenId=`sol-${Date.now().toString(36)}`;
const address=await solanaAddress(contract.accountId,tokenId);const recipient=await solanaAddress(contract.accountId,`${tokenId}-recipient`);
const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[],guardian:seller.accountId,recovery_eth:'0x1111111111111111111111111111111111111111',emergency_migration:null};
await send(seller,'mint',{token_id:tokenId,policy});
const key=newQuantumKey();
await send(seller,'register_pq_key',{token_id:tokenId,key:Buffer.from(key.publicKey).toString('base64')});
const box=await rpcQuery(contract.accountId,'nft_token',{token_id:tokenId});
const sourceBytes=Buffer.from((await import('bs58')).default.decode(address));
await send(seller,'register_sol',{token_id:tokenId,public_key:sourceBytes.toString('base64'),nonce:box.nonce,signature:Buffer.from(signAuthorization(key.secretKey,tokenId,box.nonce,sourceBytes)).toString('base64')});
const airdrop=await sol('requestAirdrop',[address,1_000_000_000]);
for(let i=0;i<30;i++){if(await solanaBalance(address,solRpc)>=1_000_000_000n)break;await new Promise(r=>setTimeout(r,1000));}
if(await solanaBalance(address,solRpc)<1_000_000_000n)throw new Error('local Solana airdrop not confirmed');
const nonce=await rpcQuery(contract.accountId,'nft_token',{token_id:tokenId}).then(x=>x.nonce);
const messageHex=unsignedSolanaTransfer(address,recipient,100_000_000n,await solanaBlockhash(solRpc));
const signature=Buffer.from(signAuthorization(key.secretKey,tokenId,nonce,Buffer.from(messageHex,'hex'))).toString('base64');
await send(seller,'request_sol_spend',{token_id:tokenId,message_hex:messageHex,nonce,signature});
await send(seller,'execute_sol',{token_id:tokenId});
const state=await rpcQuery(contract.accountId,'sol_state',{token_id:tokenId});
if(state.spend?.state!=='signed'||!state.spend.signature_json)throw new Error(`MPC did not sign Solana message: ${state.spend?.state}`);
const signed=signedSolanaTransaction(messageHex,state.spend.signature_json,address);
const txHash=await broadcastSolana(signed,solRpc);
for(let i=0;i<30;i++){const status=await sol('getSignatureStatuses',[[txHash],{searchTransactionHistory:true}]);if(status.value[0]?.confirmationStatus)break;await new Promise(r=>setTimeout(r,1000));}
const receipt=await sol('getSignatureStatuses',[[txHash],{searchTransactionHistory:true}]);
if(receipt.value[0]?.err)throw new Error(JSON.stringify(receipt.value[0].err));
if(await solanaBalance(recipient,solRpc)!==100_000_000n)throw new Error('recipient balance differs from signed transfer');
const evidence={date:new Date().toISOString().slice(0,10),network:'NEAR testnet + local Solana validator',contract:contract.accountId,tokenId,address,recipient,steps,solana:{airdrop,transfer:txHash,recipientLamports:'100000000',status:receipt.value[0]}};
writeFileSync(`deployments/solana-${evidence.date}.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(`Solana transfer confirmed: ${txHash}`);
