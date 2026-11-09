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
const file=resolve(process.argv[2]);
const tokenAccount=JSON.parse(readFileSync('.near-credentials/test-usdc.json','utf8')).id;
const record0={date:started,network:'NEAR testnet + Bitcoin Core regtest',status:'running',premiumToken:{account:tokenAccount,symbol:'tUSDC (Hako test)',decimals:6,note:'test token, no value'},priceLabel:'relayer price (testnet)',steps:[],calls:{}};
const save=()=>writeFileSync(file,JSON.stringify(record,null,2)+"\n");const send=(...a)=>sender(record,save)(...a);
const YEAR=31_536_000n,SIZE=10_000_000n,FUND_SATS=10_010_000n,FEE=1000n;
const usd=e6=>`$${(Number(e6)/1e6).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}`;
async function btc(method,params=[],wallet=''){const cookie=readFileSync('.demo/bitcoin/regtest/.cookie','utf8').trim();const r=await fetch(`http://127.0.0.1:18443/${wallet?`wallet/${wallet}`:''}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(cookie).toString('base64')}`},body:JSON.stringify({jsonrpc:'1.0',id:'calls-live',method,params})});const j=await r.json();if(!r.ok||j.error)throw new Error(`Bitcoin Core ${method}: ${JSON.stringify(j.error)}`);return j.result;}
const tusdc=id=>rpcQuery(tokenAccount,'ft_balance_of',{account_id:id}).then(BigInt);
const sigB64=(pq,tokenId,nonce,payload)=>Buffer.from(signAuthorization(pq.secretKey,tokenId,nonce,payload)).toString('base64');
function spendPayload(rawHex,sats){const p=Buffer.concat([Buffer.from(rawHex,'hex'),Buffer.alloc(8)]);p.writeBigUInt64LE(sats,p.length-8);return p;}

// Resumes a run stopped by a transient RPC error after both buys, from its own evidence file.
const record=Object.assign(record0,JSON.parse(readFileSync(file,'utf8')));record.resumedAt=new Date().toISOString();
async function main(){
  const contract=account('contract'),owner=account('seller'),buyer=account('buyer'),poster=account('guardian');
  const miner=await btc('getnewaddress',['miner','bech32'],'hako-miner');
  const buyerBtc=record.bitcoin.buyerAddress,writerBtc=record.bitcoin.writerReturnAddress;const buyerScript=bitcoinScriptHex(buyerBtc);
  const boxes={};
  for(const kind of ['itm','otm']){const c=record.calls[kind];const tokenId=c.tokenId;const k=JSON.parse(readFileSync(resolve(`.near-credentials/${tokenId}-pq.json`),'utf8'));
    const raw=await btc('getrawtransaction',[c.fundingTx,true]);const vout=raw.vout.find(v=>v.scriptPubKey.address===c.boxAddress);
    boxes[kind]={tokenId,pq:{publicKey:Buffer.from(k.publicKey,'base64'),secretKey:Buffer.from(k.secretKey,'base64')},cur:await deriveAddresses(contract.accountId,tokenId,0),next:await deriveAddresses(contract.accountId,tokenId,1),funding:c.fundingTx,vout:vout.n,sats:BigInt(c.collateralSats)};
    const st=await rpcQuery(contract.accountId,'call_state',{token_id:tokenId});if(st.premium_paid_usdc===null)throw new Error(`${kind} was never bought: ${st.state}`);
    if(!c.premiumPaid){const tenor=BigInt(st.expiry_ns-st.opened_ns)/1_000_000_000n;const notional=BigInt(c.notionalAtWriteUsdE6);Object.assign(c,{premiumPaid:st.premium_paid_usdc,tenorSec:Number(tenor),annualisedYieldPct:Number(BigInt(st.premium_paid_usdc)*YEAR*1_000_000n/(notional*tenor))/10_000,yieldFormula:'premium / (size x write spot) x 365 d / tenor'});}
  }
  const itm=boxes.itm;const expiry=BigInt(record.calls.itm.expirySec);
  const otm=boxes.otm;const release=unsignedBitcoinSpend({txid:otm.funding,vout:otm.vout,prevoutSats:otm.sats,destination:writerBtc,amountSats:otm.sats-FEE,feeSats:FEE});
  // Expiry, then one real relayed price settles both
  const wait=Number(expiry)*1000-Date.now()+3000;console.log(`waiting ${Math.round(wait/1000)} s for expiry`);if(wait>0)await sleep(wait);
  // SETTLE_FROM_TX=<hash>: settle with the print the relayer signed and posted at expiry, read back from that
  // transaction's on-chain arguments (used when the first settle attempt missed the old 60 s window).
  let price;
  if(process.env.SETTLE_FROM_TX){const {rpc}=await import('./near-lib.mjs');const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tx',params:{tx_hash:process.env.SETTLE_FROM_TX,sender_account_id:poster.accountId,wait_until:'FINAL'}})}).then(x=>x.json());if(r.error)throw new Error(JSON.stringify(r.error));
    const fc=r.result.transaction.actions[0].FunctionCall;if(fc.method_name!=='post_relayer_price'||r.result.status.Failure)throw new Error('not a successful post_relayer_price tx');const args=JSON.parse(Buffer.from(fc.args,'base64').toString());
    if(args.publish_time_sec<Number(expiry))throw new Error('posted print predates expiry');
    price={args,txHash:process.env.SETTLE_FROM_TX,print:{price:(Number(args.price_usd_e6)/1e6).toFixed(2),priceUsdE6:args.price_usd_e6,publishTimeSec:args.publish_time_sec,time:new Date(args.publish_time_sec*1000).toISOString(),sourceUrl:args.source_url,signedAndPostedIn:process.env.SETTLE_FROM_TX}};
    record.settlementNote=`Settled with the relayer print posted in ${process.env.SETTLE_FROM_TX} (trade ${args.publish_time_sec - Number(expiry)} s after expiry). The first settle attempt reached the chain more than 60 s after that print because FastNEAR returned HTTP 429, and the earlier contract rejected it; the contract was then upgraded to verify the signed print directly.`;}
  else price=await relayPrice({send,poster,contractId:contract.accountId,notBeforeSec:Number(expiry),name:'relay Coinbase BTC-USD price at expiry (relayer price, testnet)'});record.settlementPrice=price.print;save();
  for(const kind of ['itm','otm']){const b=boxes[kind];if((await rpcQuery(contract.accountId,'call_state',{token_id:b.tokenId})).state==='sold')await send(buyer,contract.accountId,call('settle_call',{token_id:b.tokenId,...price.args},60),`${kind}: settle against relayer price ${price.print.price}`);const s=await rpcQuery(contract.accountId,'call_state',{token_id:b.tokenId});record.calls[kind].settledState=['paying','paid','signing','signed'].includes(s.state)?'itm':s.state;record.calls[kind].settlementPriceUsdE6=s.oracle_price_usd_e6;save();console.log(`${kind}: ${s.state}`);}
  // ITM: strike in tUSDC, then MPC-signed Bitcoin to the buyer
  if(record.calls.itm.settledState==='itm'){
    const due=(BigInt(record.calls.itm.strikeUsdE6)*SIZE+99_999_999n)/100_000_000n;const before=await tusdc(owner.accountId);
    const pre=await rpcQuery(contract.accountId,'call_state',{token_id:itm.tokenId});
    if(pre.state==='itm'){await send(buyer,tokenAccount,call('ft_transfer_call',{receiver_id:contract.accountId,amount:due.toString(),memo:'Hako strike payment',msg:`exercise:${itm.tokenId}:${buyerScript}`},150,1n),`itm: buyer pays strike ${usd(due)} tUSDC`);
      const paid=await rpcQuery(contract.accountId,'call_state',{token_id:itm.tokenId});const after=await tusdc(owner.accountId);if(paid.state!=='paid'||after-before!==due)throw new Error('strike payment not delivered');}
    else if(['paid','signing','signed'].includes(pre.state)&&process.env.STRIKE_TX&&!record.steps.some(x=>x.txHash===process.env.STRIKE_TX)){
      // The strike tx landed but the RPC returned HTTP 500 before its result; hash recovered from NearBlocks.
      const expected=BigInt(record.calls.itm.writerTusdcBefore)+BigInt(record.calls.itm.premiumPaid)+BigInt(record.calls.otm.premiumPaid)+due;
      if(before!==expected)throw new Error(`writer tUSDC ${before} != premiums + strike ${expected}`);
      record.steps.push({name:`itm: buyer pays strike ${usd(due)} tUSDC`,txHash:process.env.STRIKE_TX,explorer:`https://testnet.nearblocks.io/txns/${process.env.STRIKE_TX}`,rejected:false,note:'RPC returned HTTP 500 after submission; hash recovered from NearBlocks; call state paid and writer balance checked'});save();
    } else if(!['paid','signing','signed'].includes(pre.state))throw new Error(`unexpected ITM state ${pre.state}`);
    record.calls.itm.strikePaid=due.toString();
    const exercise=unsignedBitcoinSpend({txid:itm.funding,vout:itm.vout,prevoutSats:itm.sats,destination:buyerBtc,amountSats:SIZE,feeSats:FEE,changeAddress:itm.next.bitcoin});
    const preSign=await rpcQuery(contract.accountId,'call_state',{token_id:itm.tokenId});
    if(preSign.state==='paid')await send(buyer,contract.accountId,call('exercise_btc',{token_id:itm.tokenId,raw_unsigned_hex:exercise.rawHex},200),'itm: contract MPC-signs Bitcoin transfer to buyer');
    else if(preSign.state==='signed'&&process.env.EXERCISE_TX){if(preSign.exercise_raw_hex!==exercise.rawHex)throw new Error('signed exercise differs from the rebuilt transaction');record.steps.push({name:'itm: contract MPC-signs Bitcoin transfer to buyer',txHash:process.env.EXERCISE_TX,explorer:`https://testnet.nearblocks.io/txns/${process.env.EXERCISE_TX}`,rejected:false,note:'RPC returned HTTP 500 while waiting for the MPC callback; hash recovered from NearBlocks; on-chain call state is signed for this exact raw transaction'});save();}
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
