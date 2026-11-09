import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Account,KeyPair,KeyPairSigner,JsonRpcProvider,PublicKey,actions,nearToYocto,teraToGas} from 'near-api-js';
import {randomBytes} from 'node:crypto';
import {deriveAddresses,bitcoinScriptHex,newQuantumKey,signAuthorization,unsignedBitcoinSpend,rpcQuery,fetchCoinbaseBtcUsd,signRelayerPrice,relayerPublicKey} from '@hako/sdk';

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
  // tUSDC (Hako test) and the price relayer, on the same local chain
  const token=await child('husdc');
  await send(token,token.accountId,[actions.deployContract(readFileSync('packages/test-usdc/target/near/hako_test_usdc.wasm')),call('new',{},50)],'deploy tUSDC (Hako test)');
  for(const a of [contract,owner])await send(owner,token.accountId,call('storage_deposit',{account_id:a.accountId,registration_only:true},30,nearToYocto('0.00125')),`register ${a.accountId} for tUSDC`);
  await send(buyer,token.accountId,call('mint',{account_id:buyer.accountId,amount:'1000000000'}),'outsider tUSDC mint rejected',true);
  await send(token,token.accountId,call('mint',{account_id:buyer.accountId,amount:'1000000000'}),'mint 1,000 tUSDC to buyer');
  const relayerSeed=randomBytes(32);const relayerKey=relayerPublicKey(relayerSeed);
  await send(owner,contract.accountId,call('set_call_config',{premium_token:token.accountId,relayer_public_key:relayerKey}),'non-contract call config rejected',true);
  await send(contract,contract.accountId,call('set_call_config',{premium_token:token.accountId,relayer_public_key:relayerKey}),'set premium token and relayer key');
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
  if(option.premium_token!==token.accountId)throw new Error('call did not fix the configured premium token');
  await send(buyer,contract.accountId,call('ft_on_transfer',{sender_id:buyer.accountId,amount:asking.toString(),msg:'buy:earn'}),'premium from a non-premium token rejected',true);
  const writerBefore=BigInt(await rpcQuery(token.accountId,'ft_balance_of',{account_id:owner.accountId},rpc));const price=BigInt(await rpcQuery(contract.accountId,'auction_price',{token_id:'earn'},rpc));
  await send(buyer,token.accountId,call('ft_transfer_call',{receiver_id:contract.accountId,amount:price.toString(),memo:'Hako call purchase',msg:'buy:earn'},150,1n),'buy call with tUSDC');
  const sold=await rpcQuery(contract.accountId,'call_state',{token_id:'earn'},rpc);const writerAfter=BigInt(await rpcQuery(token.accountId,'ft_balance_of',{account_id:owner.accountId},rpc));
  if(sold.state!=='sold'||sold.holder!==buyer.accountId||writerAfter-writerBefore!==price)throw new Error('premium not delivered to writer');record.premiumTusdc=price.toString();
  const print=await fetchCoinbaseBtcUsd();record.relayerPrint={price:print.price,time:print.time,source:print.sourceUrl};
  const post=(p,seed)=>call('post_relayer_price',{price_usd_e6:p.priceUsdE6.toString(),publish_time_sec:p.publishTimeSec,source_url:p.sourceUrl,signature:signRelayerPrice(seed,contract.accountId,p)});
  await send(buyer,contract.accountId,post(print,randomBytes(32)),'price signed by a different key rejected',true);
  await send(buyer,contract.accountId,post({...print,publishTimeSec:print.publishTimeSec-120},relayerSeed),'stale relayer price rejected',true);
  await send(buyer,contract.accountId,post({...print,sourceUrl:'https://example.com/btc'},relayerSeed),'unlisted price source rejected',true);
  await send(buyer,contract.accountId,post(print,relayerSeed),'post signed Coinbase BTC-USD relayer price');
  await send(buyer,contract.accountId,post(print,relayerSeed),'replayed relayer price rejected',true);
  const stored=await rpcQuery(contract.accountId,'relayer_price',{},rpc);if(stored.price_usd_e6!==print.priceUsdE6.toString()||stored.label!=='relayer price (testnet)')throw new Error('relayer price not stored');
  await send(buyer,contract.accountId,call('settle_call',{token_id:'earn'}),'settlement before expiry rejected',true);
  const spend=unsignedBitcoinSpend({txid:funding,vout:vout.n,prevoutSats:sats,destination,amountSats:sats-1000n,feeSats:1000n});const spendPayload=Buffer.concat([Buffer.from(spend.rawHex,'hex'),Buffer.alloc(8)]);spendPayload.writeBigUInt64LE(sats,spendPayload.length-8);
  await send(owner,contract.accountId,call('request_btc_spend',{token_id:'earn',raw_unsigned_hex:spend.rawHex,prevout_sats:sats.toString(),nonce:2,signature:Buffer.from(signAuthorization(pq.secretKey,'earn',2,spendPayload)).toString('base64')}),'encumbered BTC spend rejected',true);
  await send(owner,contract.accountId,call('nft_transfer',{receiver_id:buyer.accountId,token_id:'earn'},120,1n),'encumbered box transfer rejected',true);
  await send(owner,contract.accountId,call('list',{token_id:'earn',price:'10000000000000000000000'}),'encumbered box listing rejected',true);
  await send(owner,contract.accountId,call('close_unfilled_call',{token_id:'earn'}),'premature auction close rejected',true);
  writeFileSync('deployments/calls-sandbox.json',JSON.stringify(record,null,2)+'\n');console.log(`${record.steps.length} real-chain transactions; ${record.steps.filter(x=>x.rejected).length} rejected`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
