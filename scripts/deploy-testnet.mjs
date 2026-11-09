import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, teraToGas } from 'near-api-js';
import { deriveAddresses, newQuantumKey, signAuthorization, unsignedEthTransfer, rpcQuery, ethBalance, signedEthTransaction, broadcastEth, bitcoinScriptHex, unsignedBitcoinSpend, bitcoinSighash, signedBitcoinTransaction } from '@hako/sdk';

const rpcUrl = 'https://test.rpc.fastnear.com';
const near = new JsonRpcProvider({url:rpcUrl});
const credentialDir = resolve('.near-credentials');
const deploymentsDir = resolve('deployments');
mkdirSync(credentialDir,{recursive:true,mode:0o700});
mkdirSync(deploymentsDir,{recursive:true});
const stamp = new Date().toISOString().slice(0,10);
const evidence = {date:stamp,network:'testnet',nearRpc:rpcUrl,steps:[],accounts:{},ethereum:{chainId:31337}};

async function jsonRpc(url,method,params) {
  const response = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body=await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}
async function bitcoinRpc(method,params=[],wallet=false) {
  const cookie=readFileSync(resolve('.demo/bitcoin/regtest/.cookie'),'utf8').trim();
  const url=`http://127.0.0.1:18443/${wallet?'wallet/hako-miner':''}`;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(cookie).toString('base64')}`},body:JSON.stringify({jsonrpc:'1.0',id:'hako',method,params})});
  const body=await response.json();if(body.error)throw new Error(`Bitcoin RPC ${method}: ${JSON.stringify(body.error)}`);if(!response.ok)throw new Error(`Bitcoin RPC ${method}: HTTP ${response.status}`);return body.result;
}
async function account(label) {
  const file=resolve(credentialDir,`${label}.json`);
  let id,key;
  if (existsSync(file)) { ({id,key}=JSON.parse(readFileSync(file,'utf8'))); }
  else {
    id=`hako-${label}-${Date.now().toString(36)}.testnet`;
    key=KeyPair.fromRandom('ed25519').toString();
    writeFileSync(file,JSON.stringify({id,key}),{mode:0o600});
    const publicKey=KeyPair.fromString(key).getPublicKey().toString();
    const response=await fetch('https://helper.nearprotocol.com/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({newAccountId:id,newAccountPublicKey:publicKey})});
    if (!response.ok) throw new Error(`testnet faucet ${label}: HTTP ${response.status}`);
  }
  evidence.accounts[label]=id;
  return new Account(id,near,new KeyPairSigner(KeyPair.fromString(key)));
}
async function send(actor,receiver,action,step,expectFailure=false) {
  const result=await actor.signAndSendTransaction({receiverId:receiver,actions:[action],throwOnFailure:false,waitUntil:'FINAL'});
  const failure=result.status?.Failure;
  if (expectFailure ? !failure : !!failure) throw new Error(`${step}: ${expectFailure?'attack accepted':JSON.stringify(failure)}`);
  const txHash=result.transaction.hash;
  const gas=[result.transaction_outcome,...result.receipts_outcome].reduce((n,x)=>n+BigInt(x.outcome.gas_burnt),0n);
  evidence.steps.push({step,ok:true,rejected:expectFailure,txHash,signer:actor.accountId,gasTgas:(Number(gas)/1e12).toFixed(2),explorer:`https://testnet.nearblocks.io/txns/${txHash}`});
  console.log(`${step}: ${expectFailure?'rejected':'ok'} ${txHash}`);
  return result;
}
function call(method,args,gas=80,deposit=0n) { return actions.functionCall(method,args,teraToGas(gas),deposit); }
function save() { writeFileSync(resolve(deploymentsDir,`testnet-${stamp}.json`),JSON.stringify(evidence,null,2)+'\n'); }
async function main() {
  const wasm=readFileSync(resolve('packages/contract/target/near/hako_contract.wasm'));
  const anvilUrl=process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';
  const chainId=await jsonRpc(anvilUrl,'eth_chainId',[]);
  if (BigInt(chainId)!==31337n) throw new Error('Anvil chain ID 31337 required');
  const anvilAccounts=await jsonRpc(anvilUrl,'eth_accounts',[]);
  if (!anvilAccounts.length) throw new Error('Anvil has no funded accounts');
  const [contract,seller,buyer,guardian]=await Promise.all([account('contract'),account('seller'),account('buyer'),account('guardian')]);
  const initialized=await rpcQuery(contract.accountId,'nft_total_supply').then(()=>true).catch(()=>false);
  await send(contract,contract.accountId,actions.deployContract(wasm),initialized?'upgrade hako':'deploy hako');
  if (!initialized) {
    await send(contract,contract.accountId,call('new',{mpc_contract:'v1.signer-prod.testnet'},30),'initialize hako');
  }
  const tokenId=`box-${Date.now().toString(36)}`;
  const addresses=await deriveAddresses(contract.accountId,tokenId);
  evidence.tokenId=tokenId; evidence.addresses=addresses;
  const recovery=anvilAccounts[1].toLowerCase();
  const allow=anvilAccounts[2].toLowerCase();
  const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[allow],guardian:guardian.accountId,recovery_eth:recovery,emergency_migration:null};
  await send(seller,contract.accountId,call('mint',{token_id:tokenId,policy}), 'mint box');
  const funding=await jsonRpc(anvilUrl,'eth_sendTransaction',[{from:anvilAccounts[0],to:addresses.ethereum,value:'0x16345785d8a0000'}]);
  evidence.ethereum.fundingTx=funding;
  const balance=await ethBalance(addresses.ethereum,anvilUrl);
  if (balance < 100000000000000000n) throw new Error('Anvil funding not visible');
  const wallets=await bitcoinRpc('listwallets');
  if(!wallets.includes('hako-miner')) {
    try{await bitcoinRpc('loadwallet',['hako-miner']);}catch{await bitcoinRpc('createwallet',['hako-miner']);}
  }
  const miner=await bitcoinRpc('getnewaddress',['miner','bech32'],true);
  const height=await bitcoinRpc('getblockcount');
  if(height<101)await bitcoinRpc('generatetoaddress',[101-height,miner]);
  const btcFunding=await bitcoinRpc('sendtoaddress',[addresses.bitcoin,0.1],true);
  await bitcoinRpc('generatetoaddress',[1,miner]);
  const fundingDecoded=await bitcoinRpc('getrawtransaction',[btcFunding,true]);
  const out=fundingDecoded.vout.find(v=>v.scriptPubKey.address===addresses.bitcoin);
  if(!out||out.value!==0.1)throw new Error('Bitcoin box funding output absent or wrong amount');
  evidence.bitcoin={fundingTx:btcFunding};
  console.log(`fund BTC and ETH: ${btcFunding} / ${funding}`);
  await send(seller,contract.accountId,call('list',{token_id:tokenId,price:'10000000000000000000000'}),'list box');
  await send(buyer,contract.accountId,call('buy',{token_id:tokenId},80,10000000000000000000000n),'buy box');
  const seedFile=resolve(credentialDir,`${tokenId}-pq.json`);
  const pq=newQuantumKey();
  writeFileSync(seedFile,JSON.stringify({publicKey:Buffer.from(pq.publicKey).toString('base64'),secretKey:Buffer.from(pq.secretKey).toString('base64')}),{mode:0o600});
  await send(buyer,contract.accountId,call('register_pq_key',{token_id:tokenId,key:Buffer.from(pq.publicKey).toString('base64')}),'buyer quantum-locks');
  const policySig=signAuthorization(pq.secretKey,tokenId,0,Buffer.from(JSON.stringify(policy)));
  await send(buyer,contract.accountId,call('set_policy',{token_id:tokenId,policy,nonce:0,signature:Buffer.from(policySig).toString('base64')},120),'buyer sets vault policy');
  const over=unsignedEthTransfer({chainId:31337,nonce:0,to:allow,value:20000000000000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n});
  const overSig=signAuthorization(pq.secretKey,tokenId,1,Buffer.from(over.slice(2),'hex'));
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:over,nonce:1,signature:Buffer.from(overSig).toString('base64')},120),'over-cap rejected',true);
  const wrong=newQuantumKey();
  const delayed=unsignedEthTransfer({chainId:31337,nonce:0,to:anvilAccounts[3].toLowerCase(),value:500000000000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n});
  const wrongSig=signAuthorization(wrong.secretKey,tokenId,1,Buffer.from(delayed.slice(2),'hex'));
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:delayed,nonce:1,signature:Buffer.from(wrongSig).toString('base64')},120),'wrong PQ key rejected',true);
  const delayedSig=signAuthorization(pq.secretKey,tokenId,1,Buffer.from(delayed.slice(2),'hex'));
  await send(seller,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:delayed,nonce:1,signature:Buffer.from(delayedSig).toString('base64')},120),'seller front-run rejected',true);
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:delayed,nonce:1,signature:Buffer.from(delayedSig).toString('base64')},120),'request delayed ETH');
  const delayedSpend=(await rpcQuery(contract.accountId,'spends_for_box',{token_id:tokenId})).at(-1);
  const delayedId=delayedSpend.id;
  if (BigInt(delayedSpend.ready_ns) <= BigInt(delayedSpend.created_ns)) throw new Error('non-allowlisted request was not delayed');
  await send(buyer,contract.accountId,call('list',{token_id:tokenId,price:'10000000000000000000000'}),'listing pending box rejected',true);
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:delayed,nonce:1,signature:Buffer.from(delayedSig).toString('base64')},120),'pending request replay rejected',true);
  const wrongRecovery=unsignedEthTransfer({chainId:31337,nonce:0,to:anvilAccounts[4].toLowerCase(),value:500000000000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n});
  await send(guardian,contract.accountId,call('guardian_clawback_eth',{spend_id:delayedId,recovery_tx_hex:wrongRecovery},80),'guardian diversion rejected',true);
  const recoveryTx=unsignedEthTransfer({chainId:31337,nonce:0,to:recovery,value:500000000000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n});
  await send(guardian,contract.accountId,call('guardian_clawback_eth',{spend_id:delayedId,recovery_tx_hex:recoveryTx},80),'guardian clawback');
  const recoveryId=delayedId+1;
  await send(guardian,contract.accountId,call('execute_eth',{spend_id:recoveryId},120),'MPC signs recovery');
  const recovered=await rpcQuery(contract.accountId,'spend',{spend_id:recoveryId});
  if (recovered.state!=='signed' || !recovered.signature_json) throw new Error(`recovery signing did not complete: ${recovered.state}`);
  evidence.ethereum.recoveryTx=await broadcastEth(signedEthTransaction(recoveryTx,recovered.signature_json),anvilUrl);
  const raw=unsignedEthTransfer({chainId:31337,nonce:1,to:allow,value:1000000000000000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n});
  const signature=signAuthorization(pq.secretKey,tokenId,2,Buffer.from(raw.slice(2),'hex'));
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:raw,nonce:1,signature:Buffer.from(signature).toString('base64')},120),'nonce replay rejected',true);
  await send(buyer,contract.accountId,call('request_eth_spend',{token_id:tokenId,raw_unsigned_hex:raw,nonce:2,signature:Buffer.from(signature).toString('base64')},120),'request allowlisted ETH');
  const cleanId=recoveryId+1;
  const spend=await rpcQuery(contract.accountId,'spend',{spend_id:cleanId});
  if (!spend || spend.sighash_hex.length!==64) throw new Error('spend not recorded');
  await send(buyer,contract.accountId,call('execute_eth',{spend_id:cleanId},120),'request MPC signature');
  const signed=await rpcQuery(contract.accountId,'spend',{spend_id:cleanId});
  if (signed.state!=='signed' || !signed.signature_json) throw new Error(`MPC signing did not complete: ${signed.state}`);
  const tx=signedEthTransaction(raw,signed.signature_json);
  const withdrawal=await broadcastEth(tx,anvilUrl);
  evidence.ethereum.withdrawalTx=withdrawal;
  const receipt=await jsonRpc(anvilUrl,'eth_getTransactionReceipt',[withdrawal]);
  if (receipt?.status!=='0x1') throw new Error('Anvil rejected MPC-signed transaction');
  await send(buyer,contract.accountId,call('list',{token_id:tokenId,price:'10000000000000000000000'}),'resale after signature rejected',true);
  // Bitcoin Core regtest: real UTXO, on-chain BIP143, MPC signature, actual mempool acceptance.
  const prevoutSats=10_000_000n;
  const btcRecipient=await bitcoinRpc('getnewaddress',['recipient','bech32'],true);
  const btcRecovery=await bitcoinRpc('getnewaddress',['recovery','bech32'],true);
  const next=await deriveAddresses(contract.accountId,tokenId,1);
  const btcPolicy={daily_cap_sats:'9999500',allow_scripts:[bitcoinScriptHex(btcRecipient)],recovery_script:bitcoinScriptHex(btcRecovery)};
  let token=await rpcQuery(contract.accountId,'nft_token',{token_id:tokenId});
  const registration=JSON.stringify([addresses.bitcoinPublicKey,next.bitcoinPublicKey,btcPolicy]);
  const registerSig=signAuthorization(pq.secretKey,tokenId,token.nonce,Buffer.from(registration));
  await send(buyer,contract.accountId,call('register_btc',{token_id:tokenId,current_pubkey_hex:addresses.bitcoinPublicKey,next_pubkey_hex:next.bitcoinPublicKey,policy:btcPolicy,nonce:token.nonce,signature:Buffer.from(registerSig).toString('base64')},120),'register BTC vault');
  token=await rpcQuery(contract.accountId,'nft_token',{token_id:tokenId});
  const btcArg=(tx)=>{const data=Buffer.concat([Buffer.from(tx.rawHex,'hex'),Buffer.alloc(8)]);data.writeBigUInt64LE(prevoutSats,data.length-8);const sig=signAuthorization(pq.secretKey,tokenId,token.nonce,data);return {token_id:tokenId,raw_unsigned_hex:tx.rawHex,prevout_sats:prevoutSats.toString(),nonce:token.nonce,signature:Buffer.from(sig).toString('base64')};};
  const oldChange=unsignedBitcoinSpend({txid:btcFunding,vout:out.n,prevoutSats,destination:addresses.bitcoin,amountSats:prevoutSats-1000n,feeSats:1000n});
  await send(buyer,contract.accountId,call('request_btc_spend',btcArg(oldChange),120),'old BTC address reuse rejected',true);
  const overBtc=unsignedBitcoinSpend({txid:btcFunding,vout:out.n,prevoutSats,destination:btcRecipient,amountSats:prevoutSats-100n,feeSats:100n});
  await send(buyer,contract.accountId,call('request_btc_spend',btcArg(overBtc),120),'BTC daily cap rejected',true);
  const cleanBtc=unsignedBitcoinSpend({txid:btcFunding,vout:out.n,prevoutSats,destination:btcRecipient,amountSats:prevoutSats-1000n,feeSats:1000n});
  await send(buyer,contract.accountId,call('request_btc_spend',btcArg(cleanBtc),120),'request BTC withdrawal');
  const btcState=await rpcQuery(contract.accountId,'btc_state',{token_id:tokenId});
  const btcSpend=btcState.requests.at(-1);
  if(btcSpend.sighash_hex!==bitcoinSighash(cleanBtc.rawHex,prevoutSats,addresses.bitcoinPublicKey))throw new Error('on-chain BIP143 mismatch');
  await send(buyer,contract.accountId,call('execute_btc',{token_id:tokenId,request_id:btcSpend.id},120),'MPC signs Bitcoin');
  const signedBtcState=await rpcQuery(contract.accountId,'btc_state',{token_id:tokenId});
  const signedBtc=signedBtcState.requests.find(r=>r.id===btcSpend.id);
  if(signedBtc.state!=='signed'||!signedBtc.signature_json)throw new Error(`Bitcoin MPC signing failed: ${signedBtc.state}`);
  const rawSignedBtc=signedBitcoinTransaction(cleanBtc.rawHex,signedBtc.signature_json,addresses.bitcoinPublicKey);
  const btcWithdrawal=await bitcoinRpc('sendrawtransaction',[rawSignedBtc]);
  await bitcoinRpc('generatetoaddress',[1,miner]);
  const btcDecoded=await bitcoinRpc('getrawtransaction',[btcWithdrawal,true]);
  if(btcDecoded.confirmations<1)throw new Error('bitcoind did not confirm MPC-signed withdrawal');
  evidence.bitcoin={fundingTx:btcFunding,withdrawalTx:btcWithdrawal,recipient:btcRecipient,recovery:btcRecovery,prevoutSats:prevoutSats.toString(),onChainSighash:btcSpend.sighash_hex};
  save();
  console.log(`evidence: deployments/testnet-${stamp}.json`);
}
main().catch(e=>{ save(); console.error(e.message); process.exitCode=1; });
