// Hako testnet price relayer. Fetches the last Coinbase Exchange BTC-USD trade, signs
// (price, trade time, source URL) with the relayer ed25519 key, and posts it to the contract,
// which checks the signature, the source, 60 s freshness and that time only moves forward.
// Labelled "relayer price (testnet)". Mainnet design: read the Rhea price oracle instead.
//   node scripts/price-relayer.mjs            post one price now
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchCoinbaseBtcUsd,signRelayerPrice} from '@hako/sdk';
import {account,call,sleep} from './near-lib.mjs';

function relayerSeed(){const f=resolve('.near-credentials/price-relayer.json');try{return Buffer.from(JSON.parse(readFileSync(f,'utf8')).seed,'base64');}catch{throw new Error('Setup required: .near-credentials/price-relayer.json (run scripts/deploy-test-usdc.mjs)');}}

/** Waits for a Coinbase print with trade time >= notBeforeSec, then signs and posts it. */
export async function relayPrice({send,poster,contractId,notBeforeSec=0,name='post relayer BTC-USD price'}){
  const seed=relayerSeed();let print;
  for(let i=0;i<30;i++){print=await fetchCoinbaseBtcUsd();if(print.publishTimeSec>=notBeforeSec)break;await sleep(2000);}
  if(print.publishTimeSec<notBeforeSec)throw new Error(`no Coinbase BTC-USD trade after ${notBeforeSec}`);
  const args={price_usd_e6:print.priceUsdE6.toString(),publish_time_sec:print.publishTimeSec,source_url:print.sourceUrl,signature:signRelayerPrice(seed,contractId,print)};
  const r=await send(poster,contractId,call('post_relayer_price',args,60),name);
  return {args,print:{price:print.price,priceUsdE6:print.priceUsdE6.toString(),time:print.time,publishTimeSec:print.publishTimeSec,tradeId:print.tradeId,sourceUrl:print.sourceUrl},txHash:r.transaction.hash};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {sender}=await import('./near-lib.mjs');const record={steps:[]};const send=sender(record,()=>{});
  const contract=account('contract'),poster=account('guardian');
  const out=await relayPrice({send,poster,contractId:contract.accountId});
  console.log(`relayer price (testnet): BTC-USD ${out.print.price} at ${out.print.time} from ${out.print.sourceUrl}; tx ${out.txHash}`);
}
