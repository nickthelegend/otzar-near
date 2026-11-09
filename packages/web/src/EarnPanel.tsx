import { Chip, Empty, Field, Icon } from './ui';
import { useEffect, useMemo, useState } from 'react';
import { bitcoinAddress, deriveAddresses, dryBitcoinQuote, oneClickTokens, rpcQuery, signAuthorization, verifyAuthorization, type OneClickAsset } from '@hako/sdk';
import { annualisedPct, ago, callStateLabel, e6, nearblocksAccount, tenorLabel, TUSDC_SYMBOL, type CallConfig, type CoveredCall, type RelayerPrice } from './lib';

type Box = {token_id:string;owner_id:string;epoch:number;nonce:number;pq_key:number[]|null};
type Call = CoveredCall;
type Props = {box:Box;contractId:string;account:string;busy:boolean;clock:number;keyFile:File|null;invoke:(method:string,args:object,deposit?:string,receiver?:string)=>Promise<void>;run:(fn:()=>Promise<void>)=>Promise<void>};

function units(value:string,decimals:number):string {if(!/^\d+(?:\.\d+)?$/.test(value))throw new Error('Enter a positive amount');const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw new Error(`Maximum ${decimals} decimal places`);const n=BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');if(n<=0n)throw new Error('Amount must be positive');return n.toString();}
function decimal(value:string|number|bigint,decimals=6):string {const n=BigInt(value);return `${n/10n**BigInt(decimals)}.${(n%10n**BigInt(decimals)).toString().padStart(decimals,'0').replace(/0+$/,'')||'0'}`;}
function date(ns:number):string{return new Date(ns/1e6).toLocaleString();}
function annualized(c:Call):string {const y=annualisedPct(c);return y===null?'—':`${y.toFixed(2)}%`;}

export default function EarnPanel({box,contractId,account,busy,clock,keyFile,invoke,run}:Props){
  const [call,setCall]=useState<Call|null>(null);const [history,setHistory]=useState<Call[]>([]);const [asking,setAsking]=useState<string|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [cfg,setCfg]=useState<CallConfig|null>(null);const [relayer,setRelayer]=useState<RelayerPrice|null>(null);const [usdcBalance,setUsdcBalance]=useState<string|null>(null);const [strike,setStrike]=useState('100000');const [size,setSize]=useState('100000');const [opening,setOpening]=useState('100');const [minimum,setMinimum]=useState('20');const [hours,setHours]=useState('168');
  const [assets,setAssets]=useState<OneClickAsset[]>([]);const [asset,setAsset]=useState('');const [amount,setAmount]=useState('0.01');const [refund,setRefund]=useState('');const [quote,setQuote]=useState<any>(null);
  const previewAssets=useMemo(()=>assets.filter(a=>['ETH','SOL','USDC'].includes(a.symbol)),[assets]);
  useEffect(()=>{let live=true;oneClickTokens().then(a=>{if(live){setAssets(a);setAsset(a.find(x=>x.blockchain==='eth'&&x.symbol==='ETH')?.assetId||'');}}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[]);
  useEffect(()=>{let live=true;if(!contractId)return;Promise.all([rpcQuery(contractId,'call_state',{token_id:box.token_id}),rpcQuery(contractId,'call_history',{token_id:box.token_id}),rpcQuery(contractId,'auction_price',{token_id:box.token_id})]).then(([c,h,p])=>{if(live){setCall(c);setHistory(h);setAsking(p);setError('');}}).catch(e=>{if(live)setError(`Setup required: deploy covered-call contract (${(e as Error).message})`);});return()=>{live=false;};},[contractId,box.token_id,Math.floor(clock/15000)]);
  const token=call?.premium_token||cfg?.premium_token||'';
  useEffect(()=>{let live=true;if(!account||!token){setUsdcBalance(null);return;}rpcQuery(token,'ft_balance_of',{account_id:account}).then(b=>{if(live)setUsdcBalance(String(b));}).catch(()=>{if(live)setUsdcBalance(null);});return()=>{live=false;};},[account,token,Math.floor(clock/15000)]);
  useEffect(()=>{let live=true;if(!contractId)return;Promise.all([rpcQuery(contractId,'call_config',{}),rpcQuery(contractId,'relayer_price',{})]).then(([c,p])=>{if(live){setCfg(c);setRelayer(p);}}).catch(()=>{if(live){setCfg(null);setRelayer(null);}});return()=>{live=false;};},[contractId,Math.floor(clock/15000)]);

  async function write(){await run(async()=>{if(!keyFile)throw new Error('Setup required: ML_DSA_KEY file');const endpoint=import.meta.env.VITE_BITCOIN_ESPLORA_URL;if(!endpoint)throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');const btc=await rpcQuery(contractId,'btc_state',{token_id:box.token_id});if(!btc)throw new Error('Setup required: register_btc');const addresses=await deriveAddresses(contractId,box.token_id,btc.epoch);if(addresses.bitcoinPublicKey!==btc.current_pubkey_hex)throw new Error('Registered Bitcoin key differs from MPC derivation');const response=await fetch(`${endpoint}/address/${addresses.bitcoin}`);if(!response.ok)throw new Error(`Bitcoin service HTTP ${response.status}`);const data=await response.json();if(!Array.isArray(data.utxos)||data.utxos.length!==1)throw new Error('Exactly one live UTXO is required');const utxo=data.utxos[0];const collateral=BigInt(utxo.sats).toString();const outpoint=Buffer.concat([Buffer.from(utxo.txid,'hex').reverse(),Buffer.alloc(4)]);outpoint.writeUInt32LE(utxo.vout,32);const expirySec=Math.floor(Date.now()/1000)+Math.floor(Number(hours)*3600);const strikeUnits=units(strike,6),openingUnits=units(opening,6),minimumUnits=units(minimum,6);const payload=Buffer.from(JSON.stringify([strikeUnits,expirySec,size,openingUnits,minimumUnits,outpoint.toString('hex'),collateral]));const secret=JSON.parse(await keyFile.text());if(typeof secret.secretKey!=='string')throw new Error('Invalid ML-DSA key file');const signature=signAuthorization(Buffer.from(secret.secretKey,'base64'),box.token_id,box.nonce,payload);if(!verifyAuthorization(Uint8Array.from(box.pq_key||[]),signature,box.token_id,box.nonce,payload))throw new Error('ML-DSA key does not match vault');await invoke('write_call',{token_id:box.token_id,strike_usd_e6:strikeUnits,expiry_sec:expirySec,size_sats:size,opening_premium_usdc:openingUnits,minimum_premium_usdc:minimumUnits,collateral_outpoint_hex:outpoint.toString('hex'),collateral_sats:collateral,nonce:box.nonce,signature:Buffer.from(signature).toString('base64')});setNotice('Call written on NEAR. The UTXO amount is signed by the owner; buyers must independently verify Bitcoin collateral.');});}

  async function buy(){await run(async()=>{if(!asking)throw new Error('Auction closed');if(usdcBalance===null||BigInt(usdcBalance)<BigInt(asking))throw new Error(`Setup required: ${TUSDC_SYMBOL} balance on ${account}`);if(!token)throw new Error('Setup required: call_config premium token');await invoke('ft_transfer_call',{receiver_id:contractId,amount:asking,msg:`buy:${box.token_id}`},'1',token);setNotice(`Premium sent in ${TUSDC_SYMBOL}. The call shows Sold once the callback settles.`);});}
  async function preview(){setError('');setQuote(null);setNotice('');try{if(!contractId)throw new Error('Setup required: VITE_HAKO_CONTRACT');const selected=previewAssets.find(a=>a.assetId===asset);if(!selected)throw new Error('Select a live 1Click asset');const derived=await deriveAddresses(contractId,box.token_id,box.epoch+1);const recipient=bitcoinAddress(Buffer.from(derived.bitcoinPublicKey,'hex'),'mainnet');const result=await dryBitcoinQuote({originAsset:asset,amount:units(amount,selected.decimals),recipient,refundTo:refund});setQuote(result);setNotice('Dry quote only. No deposit address was issued and no swap was started.');}catch(e){setError((e as Error).message);}}

  const locked=!!call&&['auction','purchasing','sold','settling','itm','paying','paid','signing','signed'].includes(call.state);
  const canWrite=box.owner_id===account&&!!box.pq_key&&(!call||['unfilled','otm','lapsed','unsettled'].includes(call.state));
  const short=!!account&&(!usdcBalance||BigInt(usdcBalance)<BigInt(asking||'0'));
  return <>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {notice&&<p className="inline-note">{notice}</p>}
    <div className="card earn-hero">
      <div className="card-head"><div><h3>Covered call</h3><p>A buyer pays a premium in {TUSDC_SYMBOL} (Otzar test token, no value) for the right to buy this box's sats at the strike before expiry. The premium is yours either way; upside above the strike is capped.</p></div><Chip tone={call?(call.state==='auction'?'ice':['signed','otm'].includes(call.state)?'ok':locked?'warn':'idle'):'idle'}>{call?callStateLabel[call.state]||call.state:'No auctions yet'}</Chip></div>
      {!call?<Empty icon="coin" title="No call written on this box yet">{canWrite?'Write one below.':'The owner can write a call once the box has an ML-DSA key and a registered Bitcoin UTXO.'}</Empty>:<>
        <div className="metrics">
          <div><span>{asking?'Asking premium':'Premium'}</span><strong>{asking?decimal(asking):call.premium_paid_usdc?decimal(call.premium_paid_usdc):'—'}</strong><small>{asking?`${TUSDC_SYMBOL} · falling`:call.premium_paid_usdc?`${TUSDC_SYMBOL} paid to writer`:'auction closed'}</small></div>
          <div><span>Annualised yield</span><strong>{annualized(call)}</strong><small>premium ÷ (strike × size) × 365 d ÷ {tenorLabel((call.expiry_ns-call.opened_ns)/1e9)}</small></div>
          <div><span>Strike</span><strong>${e6(call.strike_usd_e6,0)}</strong><small>{call.oracle_price_usd_e6?`settled at $${e6(call.oracle_price_usd_e6)}`:relayer?`relayer price (testnet) $${e6(relayer.price_usd_e6)} · ${ago(relayer.publish_time_sec*1e9,clock)}`:'no relayer price yet'}</small></div>
          <div><span>Expiry</span><strong>{call.expiry_ns/1e6>clock?tenorLabel((call.expiry_ns/1e6-clock)/1000):'Expired'}</strong><small>{date(call.expiry_ns)}</small></div>
          <div><span>Collateral</span><strong>{Number(call.size_sats).toLocaleString()}</strong><small>sats {call.state==='signed'?'signed to the holder':locked?'locked':'released'}</small></div>
          <div><span>Holder</span><strong className="metric-text">{call.holder||'No buyer yet'}</strong><small>writer {call.writer}</small></div>
        </div>
        {call.state==='auction'&&short&&<p className="warn-line"><Icon name="coin"/> Setup required: {TUSDC_SYMBOL} balance. {token?<>The test token <a href={nearblocksAccount(token)} target="_blank" rel="noreferrer"><code>{token}</code></a> is minted by its own account (<code>scripts/deploy-test-usdc.mjs</code>); it has no faucet page.</>:'No premium token configured.'}</p>}
        {call.state==='auction'&&account&&<button className="btn btn-primary" onClick={buy} disabled={busy||!asking||!usdcBalance||BigInt(usdcBalance)<BigInt(asking)}>Buy call with {TUSDC_SYMBOL}</button>}
        {call.state==='itm'&&<p className="inline-note">Exercise window ends {date(call.exercise_deadline_ns!)}. The holder pays the strike in {TUSDC_SYMBOL}, then the contract MPC-signs the Bitcoin transfer.</p>}
        {call.state==='sold'&&<p className="fineprint">After expiry anyone can submit the Coinbase BTC-USD print that the Otzar relayer signed in the first five minutes after expiry (relayer price, testnet); the contract checks the signature and the time. Unsettled after 24 hours, the call stops encumbering the box.</p>}
      </>}
    </div>
    {canWrite&&<div className="card">
      <div className="card-head"><div><h3>Write a call</h3><p>Signed with your ML-DSA key. While it is open the contract blocks BTC spends, listing and transfer of this box.</p></div></div>
      <div className="form">
        <div className="form-grid form-grid-3">
          <Field label="Strike (USD)"><input value={strike} onChange={e=>setStrike(e.target.value)} inputMode="decimal"/></Field>
          <Field label="Size (sats)"><input value={size} onChange={e=>setSize(e.target.value)} inputMode="numeric"/></Field>
          <Field label="Term (hours)"><input value={hours} onChange={e=>setHours(e.target.value)} inputMode="numeric"/></Field>
          <Field label="Opening premium (tUSDC)"><input value={opening} onChange={e=>setOpening(e.target.value)} inputMode="decimal"/></Field>
          <Field label="Minimum premium (tUSDC)"><input value={minimum} onChange={e=>setMinimum(e.target.value)} inputMode="decimal"/></Field>
        </div>
        <p className="warn-line"><Icon name="shield"/> This browser checks the Bitcoin collateral against the live UTXO service. NEAR cannot independently verify Bitcoin ownership.</p>
        <button className="btn btn-primary" onClick={write} disabled={busy}>Sign and write call</button>
      </div>
    </div>}
    {history.length>0&&<div className="card">
      <div className="card-head"><div><h3>Call history</h3></div></div>
      <ul className="history">{history.slice().reverse().map(c=><li key={c.id}><b>#{c.id}</b><Chip tone={['signed','otm','paid'].includes(c.state)?'ok':'idle'}>{callStateLabel[c.state]||c.state}</Chip><span>{c.premium_paid_usdc?`${decimal(c.premium_paid_usdc)} ${TUSDC_SYMBOL} paid`:'no premium paid'}</span><small>{date(c.opened_ns)}</small></li>)}</ul>
    </div>}
    <div className="card">
      <div className="card-head"><div><h3>Deposit anything</h3><p>A live NEAR Intents 1Click quote from ETH, SOL or USDC into this box's next-epoch native BTC address. Dry quote only: no deposit address, no swap. Execution needs <code>NEAR_MAINNET_ACCOUNT</code>.</p></div><Chip tone="warn">Dry quote</Chip></div>
      <div className="form">
        <div className="form-grid form-grid-3">
          <Field label="Origin asset"><select value={asset} onChange={e=>setAsset(e.target.value)}>{previewAssets.length===0&&<option value="">Loading 1Click assets…</option>}{previewAssets.map(a=><option key={a.assetId} value={a.assetId}>{a.symbol} · {a.blockchain}</option>)}</select></Field>
          <Field label="Amount"><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"/></Field>
          <Field label="Refund address (origin chain)"><input value={refund} onChange={e=>setRefund(e.target.value)} placeholder="Your origin-chain address" spellCheck={false}/></Field>
        </div>
        <button className="btn btn-ghost" onClick={preview} disabled={!asset}>Get dry quote</button>
        {quote&&<div className="quote"><div><span>You would receive</span><strong>{quote.quote?.amountOutFormatted||decimal(quote.quote?.amountOut||'0',8)} BTC</strong></div><div><span>Minimum</span><strong>{quote.quote?.minAmountOut?decimal(quote.quote.minAmountOut,8):'unavailable'} BTC</strong></div><div><span>Quote ID</span><code>{quote.correlationId||'unavailable'}</code></div></div>}
      </div>
    </div>
  </>;
}
