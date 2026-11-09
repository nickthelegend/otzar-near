// Full covered-call loop on NEAR testnet with Bitcoin Core regtest collateral:
//   ITM call: write -> Dutch-auction buy in tUSDC (premium lands with the writer) -> expiry ->
//             relayer-priced settlement -> buyer pays the strike in tUSDC -> contract MPC-signs the
//             Bitcoin transfer to the buyer -> Bitcoin Core regtest confirms it.
//   OTM call: same write and buy -> expiry -> settles OTM -> encumbrance released -> the writer's own
//             MPC-signed spend of the collateral confirms on regtest.
// Strikes are set from the real Coinbase BTC-USD price at write time (ITM 2% below, OTM 3% above) so
// the real price at expiry decides the outcome. Nothing is simulated; any failure stops the run.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {deriveAddresses,bitcoinScriptHex,newQuantumKey,signAuthorization,unsignedBitcoinSpend,signedBitcoinTransaction,rpcQuery,fetchCoinbaseBtcUsd} from '@hako/sdk';
import {account,call,sender,codeHash,sleep} from './near-lib.mjs';
import {relayPrice} from './price-relayer.mjs';

const started=new Date().toISOString();const runId=started.slice(11,19).replaceAll(':','');
const file=resolve(`deployments/calls-live-testnet-${started.slice(0,10)}-${runId}.json`);
const tokenAccount=JSON.parse(readFileSync('.near-credentials/test-usdc.json','utf8')).id;
const record={date:started,network:'NEAR testnet + Bitcoin Core regtest',status:'running',premiumToken:{account:tokenAccount,symbol:'tUSDC (Hako test)',decimals:6,note:'test token, no value'},priceLabel:'relayer price (testnet)',steps:[],calls:{}};
const save=()=>writeFileSync(file,JSON.stringify(record,null,2)+'\n');const send=sender(record,save);
const YEAR=31_536_000n,SIZE=10_000_000n,FUND_SATS=10_010_000n,FEE=1000n;
const usd=e6=>`$${(Number(e6)/1e6).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}`;
async function btc(method,params=[],wallet=''){const cookie=readFileSync('.demo/bitcoin/regtest/.cookie','utf8').trim();const r=await fetch(`http://127.0.0.1:18443/${wallet?`wallet/${wallet}`:''}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(cookie).toString('base64')}`},body:JSON.stringify({jsonrpc:'1.0',id:'calls-live',method,params})});const j=await r.json();if(!r.ok||j.error)throw new Error(`Bitcoin Core ${method}: ${JSON.stringify(j.error)}`);return j.result;}
const tusdc=id=>rpcQuery(tokenAccount,'ft_balance_of',{account_id:id}).then(BigInt);
const sigB64=(pq,tokenId,nonce,payload)=>Buffer.from(signAuthorization(pq.secretKey,tokenId,nonce,payload)).toString('base64');
function spendPayload(rawHex,sats){const p=Buffer.concat([Buffer.from(rawHex,'hex'),Buffer.alloc(8)]);p.writeBigUInt64LE(sats,p.length-8);return p;}

async function main(){
  const contract=account('contract'),owner=account('seller'),buyer=account('buyer'),poster=account('guardian');
  record.accounts={contract:contract.accountId,writer:owner.accountId,buyer:buyer.accountId,relayerPoster:poster.accountId};save();
  const wasm=readFileSync('packages/contract/target/near/hako_contract.wasm');const {code,block}=await codeHash(contract.accountId);
  const local=createHash('sha256').update(wasm).digest('hex');if(createHash('sha256').update(code).digest('hex')!==local)throw new Error('Setup required: deployed contract differs from local wasm; run scripts/setup-relayer-testnet.mjs');
  record.contractWasmSha256=local;record.codeVerifiedAtBlock=block;
  const cfg=await rpcQuery(contract.accountId,'call_config',{});if(cfg.premium_token!==tokenAccount||!cfg.relayer_public_key)throw new Error('Setup required: set_call_config');record.relayerPublicKey=cfg.relayer_public_key;save();
  if(await tusdc(buyer.accountId)<20_000_000_000n)throw new Error(`Setup required: mint tUSDC to ${buyer.accountId} (scripts/deploy-test-usdc.mjs)`);
  // Bitcoin Core regtest wallets
  const wallets=await btc('listwallets');for(const name of ['hako-miner','hako-call-buyer','hako-call-writer']){if(!wallets.includes(name)){try{await btc('loadwallet',[name]);}catch{await btc('createwallet',[name]);}}}
  const miner=await btc('getnewaddress',['miner','bech32'],'hako-miner');const height=await btc('getblockcount');if(height<101)await btc('generatetoaddress',[101-height,miner]);
  const buyerBtc=await btc('getnewaddress',['call-buyer','bech32'],'hako-call-buyer'),writerBtc=await btc('getnewaddress',['call-writer-return','bech32'],'hako-call-writer');
  record.bitcoin={buyerAddress:buyerBtc,writerReturnAddress:writerBtc};
  const writerScript=bitcoinScriptHex(writerBtc),buyerScript=bitcoinScriptHex(buyerBtc);
  // Two boxes, each with its own regtest collateral
  const boxes={};
  for(const kind of ['itm','otm']){
    const tokenId=`call-${kind}-${Date.now().toString(36)}`;const cur=await deriveAddresses(contract.accountId,tokenId,0),next=await deriveAddresses(contract.accountId,tokenId,1);
    const policy={daily_eth_wei:'10000000000000000',delay_sec:120,allow_eth:[],guardian:poster.accountId,recovery_eth:'0x2222222222222222222222222222222222222222',emergency_migration:null};
    await send(owner,contract.accountId,call('mint',{token_id:tokenId,policy}),`${kind}: mint box ${tokenId}`);
    const pq=newQuantumKey();writeFileSync(resolve(`.near-credentials/${tokenId}-pq.json`),JSON.stringify({publicKey:Buffer.from(pq.publicKey).toString('base64'),secretKey:Buffer.from(pq.secretKey).toString('base64')}),{mode:0o600});
    await send(owner,contract.accountId,call('register_pq_key',{token_id:tokenId,key:Buffer.from(pq.publicKey).toString('base64')}),`${kind}: register ML-DSA writer key`);
    const btcPolicy={daily_cap_sats:'20000000',allow_scripts:[writerScript],recovery_script:writerScript};
    await send(owner,contract.accountId,call('register_btc',{token_id:tokenId,current_pubkey_hex:cur.bitcoinPublicKey,next_pubkey_hex:next.bitcoinPublicKey,policy:btcPolicy,nonce:0,signature:sigB64(pq,tokenId,0,Buffer.from(JSON.stringify([cur.bitcoinPublicKey,next.bitcoinPublicKey,btcPolicy])))}),`${kind}: register Bitcoin key and policy`);
    const funding=await btc('sendtoaddress',[cur.bitcoin,Number(FUND_SATS)/1e8],'hako-miner');await btc('generatetoaddress',[1,miner]);
    const raw=await btc('getrawtransaction',[funding,true]);const vout=raw.vout.find(v=>v.scriptPubKey.address===cur.bitcoin);if(!vout)throw new Error('funding output absent');
    const sats=BigInt(Math.round(vout.value*1e8));const outpoint=Buffer.concat([Buffer.from(funding,'hex').reverse(),Buffer.alloc(4)]);outpoint.writeUInt32LE(vout.n,32);
    boxes[kind]={tokenId,pq,cur,next,funding,vout:vout.n,sats,outpoint:outpoint.toString('hex')};
    record.calls[kind]={tokenId,boxAddress:cur.bitcoin,fundingTx:funding,collateralSats:sats.toString()};save();
    console.log(`${kind}: box ${cur.bitcoin} funded ${sats} sats in ${funding}`);
  }
  // Write both calls against the real spot price
  const spot=await fetchCoinbaseBtcUsd();record.writeSpot={price:spot.price,priceUsdE6:spot.priceUsdE6.toString(),time:spot.time,source:spot.sourceUrl,label:'Coinbase spot used to choose strikes (not posted on-chain)'};
  const nowSec=BigInt(Math.floor(Date.now()/1000));const expiry=nowSec+240n;
  for(const kind of ['itm','otm']){
    const b=boxes[kind];const strike=kind==='itm'?(spot.priceUsdE6*98n/100n)/1_000_000n*1_000_000n:((spot.priceUsdE6*103n/100n)/1_000_000n+1n)*1_000_000n;
    const tenor=expiry-BigInt(Math.floor(Date.now()/1000));const notional=spot.priceUsdE6*SIZE/100_000_000n;
    // Dutch auction quoted in annualised terms: opens at 20% APR of notional, floors at 5% APR, over this call's tenor.
    const opening=notional*20n*tenor/(100n*YEAR),minimum=notional*5n*tenor/(100n*YEAR);
    const terms={token_id:b.tokenId,strike_usd_e6:strike.toString(),expiry_sec:Number(expiry),size_sats:SIZE.toString(),opening_premium_usdc:opening.toString(),minimum_premium_usdc:minimum.toString(),collateral_outpoint_hex:b.outpoint,collateral_sats:b.sats.toString(),nonce:1};
    const payload=Buffer.from(JSON.stringify([terms.strike_usd_e6,terms.expiry_sec,terms.size_sats,terms.opening_premium_usdc,terms.minimum_premium_usdc,terms.collateral_outpoint_hex,terms.collateral_sats]));
    await send(owner,contract.accountId,call('write_call',{...terms,signature:sigB64(b.pq,b.tokenId,1,payload)}),`${kind}: write covered call, strike ${usd(strike)} (${kind==='itm'?'2% below':'3% above'} spot ${spot.price})`);
    Object.assign(record.calls[kind],{strikeUsdE6:strike.toString(),sizeSats:SIZE.toString(),expirySec:Number(expiry),notionalAtWriteUsdE6:notional.toString(),openingPremium:opening.toString(),minimumPremium:minimum.toString()});save();
  }
  // Encumbrance: the writer cannot move the collateral while the call is live
  const itm=boxes.itm;const sweep=unsignedBitcoinSpend({txid:itm.funding,vout:itm.vout,prevoutSats:itm.sats,destination:writerBtc,amountSats:itm.sats-FEE,feeSats:FEE});
  await send(owner,contract.accountId,call('request_btc_spend',{token_id:itm.tokenId,raw_unsigned_hex:sweep.rawHex,prevout_sats:itm.sats.toString(),nonce:2,signature:sigB64(itm.pq,itm.tokenId,2,spendPayload(sweep.rawHex,itm.sats))}),'itm: writer front-run spend of collateral rejected',true);
  // Dutch-auction buys in tUSDC
  for(const kind of ['itm','otm']){
    const b=boxes[kind];const before=await tusdc(owner.accountId);const asking=BigInt(await rpcQuery(contract.accountId,'auction_price',{token_id:b.tokenId}));
    await send(buyer,tokenAccount,call('ft_transfer_call',{receiver_id:contract.accountId,amount:asking.toString(),memo:'Hako call purchase',msg:`buy:${b.tokenId}`},150,1n),`${kind}: buy call, premium ${usd(asking)} tUSDC`);
    const c=await rpcQuery(contract.accountId,'call_state',{token_id:b.tokenId});const after=await tusdc(owner.accountId);
    if(c.state!=='sold'||c.holder!==buyer.accountId||after-before<asking)throw new Error(`${kind}: premium not delivered or call not sold`);
    const tenor=BigInt(c.expiry_ns-c.opened_ns)/1_000_000_000n;const notional=BigInt(record.calls[kind].notionalAtWriteUsdE6);
    Object.assign(record.calls[kind],{premiumPaid:c.premium_paid_usdc,writerTusdcBefore:before.toString(),writerTusdcAfter:after.toString(),tenorSec:Number(tenor),annualisedYieldPct:Number(BigInt(c.premium_paid_usdc)*YEAR*1_000_000n/(notional*tenor))/10_000,yieldFormula:'premium / (size x write spot) x 365 d / tenor'});save();
  }
  const otm=boxes.otm;const release=unsignedBitcoinSpend({txid:otm.funding,vout:otm.vout,prevoutSats:otm.sats,destination:writerBtc,amountSats:otm.sats-FEE,feeSats:FEE});
  await send(owner,contract.accountId,call('request_btc_spend',{token_id:otm.tokenId,raw_unsigned_hex:release.rawHex,prevout_sats:otm.sats.toString(),nonce:2,signature:sigB64(otm.pq,otm.tokenId,2,spendPayload(release.rawHex,otm.sats))}),'otm: writer spend of sold-call collateral rejected',true);
  // Expiry, then one real relayed price settles both
  const wait=Number(expiry)*1000-Date.now()+3000;console.log(`waiting ${Math.round(wait/1000)} s for expiry`);if(wait>0)await sleep(wait);
  const price=await relayPrice({send,poster,contractId:contract.accountId,notBeforeSec:Number(expiry),name:'relay Coinbase BTC-USD price at expiry (relayer price, testnet)'});record.settlementPrice=price.print;save();
  for(const kind of ['itm','otm']){const b=boxes[kind];await send(buyer,contract.accountId,call('settle_call',{token_id:b.tokenId,...price.args},60),`${kind}: settle against relayer price ${price.print.price}`);const s=await rpcQuery(contract.accountId,'call_state',{token_id:b.tokenId});record.calls[kind].settledState=s.state;record.calls[kind].settlementPriceUsdE6=s.oracle_price_usd_e6;save();console.log(`${kind}: ${s.state}`);}
  // ITM: strike in tUSDC, then MPC-signed Bitcoin to the buyer
  if(record.calls.itm.settledState==='itm'){
    const due=(BigInt(record.calls.itm.strikeUsdE6)*SIZE+99_999_999n)/100_000_000n;const before=await tusdc(owner.accountId);
    await send(buyer,tokenAccount,call('ft_transfer_call',{receiver_id:contract.accountId,amount:due.toString(),memo:'Hako strike payment',msg:`exercise:${itm.tokenId}:${buyerScript}`},150,1n),`itm: buyer pays strike ${usd(due)} tUSDC`);
    const paid=await rpcQuery(contract.accountId,'call_state',{token_id:itm.tokenId});const after=await tusdc(owner.accountId);if(paid.state!=='paid'||after-before!==due)throw new Error('strike payment not delivered');
    record.calls.itm.strikePaid=due.toString();
    const exercise=unsignedBitcoinSpend({txid:itm.funding,vout:itm.vout,prevoutSats:itm.sats,destination:buyerBtc,amountSats:SIZE,feeSats:FEE,changeAddress:itm.next.bitcoin});
    await send(buyer,contract.accountId,call('exercise_btc',{token_id:itm.tokenId,raw_unsigned_hex:exercise.rawHex},200),'itm: contract MPC-signs Bitcoin transfer to buyer');
    const signed=await rpcQuery(contract.accountId,'call_state',{token_id:itm.tokenId});if(signed.state!=='signed'||!signed.exercise_signature_json)throw new Error('MPC exercise signature absent');
    const txid=await btc('sendrawtransaction',[signedBitcoinTransaction(exercise.rawHex,signed.exercise_signature_json,itm.cur.bitcoinPublicKey)]);const blocks=await btc('generatetoaddress',[1,miner]);
    const tx=await btc('getrawtransaction',[txid,true]);const got=await btc('getreceivedbyaddress',[buyerBtc,1],'hako-call-buyer');
    if(tx.confirmations<1||Math.round(got*1e8)!==Number(SIZE))throw new Error('buyer regtest receipt absent');
    Object.assign(record.calls.itm,{exerciseBtcTx:txid,exerciseBlock:blocks[0],buyerReceivedSats:String(Math.round(got*1e8)),changeToNextEpoch:itm.next.bitcoin});save();
    console.log(`itm: buyer received ${SIZE} sats in ${txid}`);
  }
  // OTM: the encumbrance is gone, so the writer's own spend is accepted, MPC-signed and confirmed
  if(record.calls.otm.settledState==='otm'){
    const r=await send(owner,contract.accountId,call('request_btc_spend',{token_id:otm.tokenId,raw_unsigned_hex:release.rawHex,prevout_sats:otm.sats.toString(),nonce:2,signature:sigB64(otm.pq,otm.tokenId,2,spendPayload(release.rawHex,otm.sats))}),'otm: writer spend accepted after OTM expiry (encumbrance released)');
    const st=await rpcQuery(contract.accountId,'btc_state',{token_id:otm.tokenId});const req=st.requests[st.requests.length-1];
    await send(owner,contract.accountId,call('execute_btc',{token_id:otm.tokenId,request_id:req.id},200),'otm: MPC signs writer collateral release');
    const done=(await rpcQuery(contract.accountId,'btc_state',{token_id:otm.tokenId})).requests.find(x=>x.id===req.id);if(done.state!=='signed')throw new Error(`release not signed: ${done.state}`);
    const txid=await btc('sendrawtransaction',[signedBitcoinTransaction(release.rawHex,done.signature_json,otm.cur.bitcoinPublicKey)]);await btc('generatetoaddress',[1,miner]);
    const tx=await btc('getrawtransaction',[txid,true]);if(tx.confirmations<1)throw new Error('release not confirmed');
    Object.assign(record.calls.otm,{releaseBtcTx:txid,writerReturnedSats:(otm.sats-FEE).toString()});save();console.log(`otm: collateral returned to writer in ${txid}`);
  }
  const earned=['itm','otm'].reduce((a,k)=>a+BigInt(record.calls[k].premiumPaid||0),0n);record.writerPremiumEarned=earned.toString();
  record.status=`ITM ${record.calls.itm.settledState}${record.calls.itm.exerciseBtcTx?' exercised on regtest':''}; OTM ${record.calls.otm.settledState}${record.calls.otm.releaseBtcTx?' collateral released':''}; premium earned ${usd(earned)} tUSDC`;
  console.log(record.status);save();
}
main().catch(e=>{record.status=`FAILED: ${e.message}`;save();console.error(e.message);process.exitCode=1;});
