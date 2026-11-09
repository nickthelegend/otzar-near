import { Chip, Empty, Field, Icon } from './ui';
import { useEffect, useMemo, useState } from 'react';
import { bitcoinAddress, deriveAddresses, dryBitcoinQuote, oneClickTokens, rpcQuery, signAuthorization, verifyAuthorization, type OneClickAsset } from '@hako/sdk';

type Box = {token_id:string;owner_id:string;epoch:number;nonce:number;pq_key:number[]|null};
type Call = {id:number;state:string;writer:string;holder:string|null;strike_usd_e6:string;size_sats:string;opening_premium_usdc:string;minimum_premium_usdc:string;premium_paid_usdc:string|null;opened_ns:number;auction_end_ns:number;expiry_ns:number;exercise_deadline_ns:number|null;oracle_price_usd_e6:string|null;collateral_sats:string;collateral_outpoint_hex:string;exercise_signature_json:string|null};
type Props = {box:Box;contractId:string;account:string;busy:boolean;clock:number;keyFile:File|null;invoke:(method:string,args:object,deposit?:string,receiver?:string)=>Promise<void>;run:(fn:()=>Promise<void>)=>Promise<void>};
const USDC='usdc.tidepool-sandbox.testnet';
const FEED='e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';

function units(value:string,decimals:number):string {if(!/^\d+(?:\.\d+)?$/.test(value))throw new Error('Enter a positive amount');const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw new Error(`Maximum ${decimals} decimal places`);const n=BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');if(n<=0n)throw new Error('Amount must be positive');return n.toString();}
function decimal(value:string|number|bigint,decimals=6):string {const n=BigInt(value);return `${n/10n**BigInt(decimals)}.${(n%10n**BigInt(decimals)).toString().padStart(decimals,'0').replace(/0+$/,'')||'0'}`;}
function date(ns:number):string{return new Date(ns/1e6).toLocaleString();}
function annualized(c:Call):string {if(!c.premium_paid_usdc)return '—';const term=(c.expiry_ns-c.opened_ns)/1e9;const notional=Number(c.strike_usd_e6)*Number(c.size_sats)/1e8;if(!Number.isFinite(term)||term<=0||!Number.isFinite(notional)||notional<=0)return '—';return `${(Number(c.premium_paid_usdc)/notional*365*86400/term*100).toFixed(2)}%`;}

export default function EarnPanel({box,contractId,account,busy,clock,keyFile,invoke,run}:Props){
  const [call,setCall]=useState<Call|null>(null);const [history,setHistory]=useState<Call[]>([]);const [asking,setAsking]=useState<string|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [oracle,setOracle]=useState<string|null>(null);const [usdcBalance,setUsdcBalance]=useState<string|null>(null);const [strike,setStrike]=useState('100000');const [size,setSize]=useState('100000');const [opening,setOpening]=useState('100');const [minimum,setMinimum]=useState('20');const [hours,setHours]=useState('168');
  const [assets,setAssets]=useState<OneClickAsset[]>([]);const [asset,setAsset]=useState('');const [amount,setAmount]=useState('0.01');const [refund,setRefund]=useState('');const [quote,setQuote]=useState<any>(null);
  const previewAssets=useMemo(()=>assets.filter(a=>['ETH','SOL','USDC'].includes(a.symbol)),[assets]);
  useEffect(()=>{let live=true;oneClickTokens().then(a=>{if(live){setAssets(a);setAsset(a.find(x=>x.blockchain==='eth'&&x.symbol==='ETH')?.assetId||'');}}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[]);
  useEffect(()=>{let live=true;if(!contractId)return;Promise.all([rpcQuery(contractId,'call_state',{token_id:box.token_id}),rpcQuery(contractId,'call_history',{token_id:box.token_id}),rpcQuery(contractId,'auction_price',{token_id:box.token_id})]).then(([c,h,p])=>{if(live){setCall(c);setHistory(h);setAsking(p);setError('');}}).catch(e=>{if(live)setError(`Setup required: deploy covered-call contract (${(e as Error).message})`);});return()=>{live=false;};},[contractId,box.token_id,Math.floor(clock/15000)]);
  useEffect(()=>{let live=true;if(!account){setUsdcBalance(null);return;}rpcQuery(USDC,'ft_balance_of',{account_id:account}).then(b=>{if(live)setUsdcBalance(String(b));}).catch(()=>{if(live)setUsdcBalance(null);});return()=>{live=false;};},[account,Math.floor(clock/15000)]);
  useEffect(()=>{let live=true;rpcQuery('pyth-oracle.testnet','get_price_no_older_than',{price_id:FEED,age:60}).then(p=>{if(!live)return;if(!p){setOracle(null);return;}const price=Number(p.price)*10**Number(p.expo);setOracle(Number.isFinite(price)?price.toLocaleString(undefined,{maximumFractionDigits:2}):null);}).catch(()=>{if(live)setOracle(null);});return()=>{live=false;};},[Math.floor(clock/30000)]);

  async function write(){await run(async()=>{if(!keyFile)throw new Error('Setup required: ML_DSA_KEY file');const endpoint=import.meta.env.VITE_BITCOIN_ESPLORA_URL;if(!endpoint)throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');const btc=await rpcQuery(contractId,'btc_state',{token_id:box.token_id});if(!btc)throw new Error('Setup required: register_btc');const addresses=await deriveAddresses(contractId,box.token_id,btc.epoch);if(addresses.bitcoinPublicKey!==btc.current_pubkey_hex)throw new Error('Registered Bitcoin key differs from MPC derivation');const response=await fetch(`${endpoint}/address/${addresses.bitcoin}`);if(!response.ok)throw new Error(`Bitcoin service HTTP ${response.status}`);const data=await response.json();if(!Array.isArray(data.utxos)||data.utxos.length!==1)throw new Error('Exactly one live UTXO is required');const utxo=data.utxos[0];const collateral=BigInt(utxo.sats).toString();const outpoint=Buffer.concat([Buffer.from(utxo.txid,'hex').reverse(),Buffer.alloc(4)]);outpoint.writeUInt32LE(utxo.vout,32);const expirySec=Math.floor(Date.now()/1000)+Math.floor(Number(hours)*3600);const strikeUnits=units(strike,6),openingUnits=units(opening,6),minimumUnits=units(minimum,6);const payload=Buffer.from(JSON.stringify([strikeUnits,expirySec,size,openingUnits,minimumUnits,outpoint.toString('hex'),collateral]));const secret=JSON.parse(await keyFile.text());if(typeof secret.secretKey!=='string')throw new Error('Invalid ML-DSA key file');const signature=signAuthorization(Buffer.from(secret.secretKey,'base64'),box.token_id,box.nonce,payload);if(!verifyAuthorization(Uint8Array.from(box.pq_key||[]),signature,box.token_id,box.nonce,payload))throw new Error('ML-DSA key does not match vault');await invoke('write_call',{token_id:box.token_id,strike_usd_e6:strikeUnits,expiry_sec:expirySec,size_sats:size,opening_premium_usdc:openingUnits,minimum_premium_usdc:minimumUnits,collateral_outpoint_hex:outpoint.toString('hex'),collateral_sats:collateral,nonce:box.nonce,signature:Buffer.from(signature).toString('base64')});setNotice('Call written on NEAR. The UTXO amount is signed by the owner; buyers must independently verify Bitcoin collateral.');});}

  async function buy(){await run(async()=>{if(!asking)throw new Error('Auction closed');if(usdcBalance===null||BigInt(usdcBalance)<BigInt(asking))throw new Error('Setup required: TESTNET_USDC_FUNDS');await invoke('ft_transfer_call',{receiver_id:contractId,amount:asking,msg:`buy:${box.token_id}`},'1',USDC);setNotice('Check the USDC transfer and covered-call state after the callback settles.');});}
  async function preview(){setError('');setQuote(null);setNotice('');try{if(!contractId)throw new Error('Setup required: VITE_HAKO_CONTRACT');const selected=previewAssets.find(a=>a.assetId===asset);if(!selected)throw new Error('Select a live 1Click asset');const derived=await deriveAddresses(contractId,box.token_id,box.epoch+1);const recipient=bitcoinAddress(Buffer.from(derived.bitcoinPublicKey,'hex'),'mainnet');const result=await dryBitcoinQuote({originAsset:asset,amount:units(amount,selected.decimals),recipient,refundTo:refund});setQuote(result);setNotice('Dry quote only. No deposit address was issued and no swap was started.');}catch(e){setError((e as Error).message);}}

  const locked=!!call&&['auction','purchasing','sold','settling','itm','paying','paid','signing','signed'].includes(call.state);
  const canWrite=box.owner_id===account&&!!box.pq_key&&(!call||['unfilled','otm','lapsed'].includes(call.state));
  const short=!!account&&(!usdcBalance||BigInt(usdcBalance)<BigInt(asking||'0'));
  return <>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {notice&&<p className="inline-note">{notice}</p>}
    <div className="card earn-hero">
      <div className="card-head"><div><h3>Covered call</h3><p>A buyer pays a USDC premium for the right to buy this box's sats at the strike before expiry. The premium is yours; upside above the strike is capped.</p></div><Chip tone={call?(call.state==='auction'?'ice':locked?'warn':'idle'):'idle'}>{call?.state||'No auctions yet'}</Chip></div>
      {!call?<Empty icon="coin" title="No call written on this box yet">{canWrite?'Write one below.':'The owner can write a call once the box has an ML-DSA key and a registered Bitcoin UTXO.'}</Empty>:<>
        <div className="metrics">
          <div><span>Asking premium</span><strong>{asking?decimal(asking):call.premium_paid_usdc?decimal(call.premium_paid_usdc):'—'}</strong><small>{asking?'USDC · falling':call.premium_paid_usdc?'USDC paid':'auction closed'}</small></div>
          <div><span>Annualised yield</span><strong>{annualized(call)}</strong><small>paid premium ÷ strike notional × 365d ÷ term</small></div>
          <div><span>Strike</span><strong>${decimal(call.strike_usd_e6)}</strong><small>Pyth BTC/USD {oracle?`$${oracle}`:'· no fresh price'}</small></div>
          <div><span>Expiry</span><strong>{Math.max(0,Math.ceil((call.expiry_ns/1e6-clock)/3600000))}h</strong><small>{date(call.expiry_ns)}</small></div>
          <div><span>Collateral</span><strong>{Number(call.size_sats).toLocaleString()}</strong><small>sats {locked?'locked':'released'}</small></div>
          <div><span>Holder</span><strong className="metric-text">{call.holder||'No buyer yet'}</strong><small>writer {call.writer}</small></div>
        </div>
        {call.state==='auction'&&short&&<p className="warn-line"><Icon name="coin"/> Setup required: TESTNET_USDC_FUNDS. Fund this account at the <a href="https://app.usetidepool.tech/faucet" target="_blank" rel="noreferrer">Tidepool faucet</a>.</p>}
        {call.state==='auction'&&account&&<button className="btn btn-primary" onClick={buy} disabled={busy||!asking||!usdcBalance||BigInt(usdcBalance)<BigInt(asking)}>Buy call with testnet USDC</button>}
        {call.state==='itm'&&<p className="inline-note">Exercise window ends {date(call.exercise_deadline_ns!)}. The holder pays the strike in testnet USDC, then requests an MPC-signed Bitcoin transfer.</p>}
        {call.state==='sold'&&<p className="fineprint">Settlement reads a fresh BTC/USD update from Pyth on NEAR at expiry. No fresh update means settlement stays pending.</p>}
      </>}
    </div>
    {canWrite&&<div className="card">
      <div className="card-head"><div><h3>Write a call</h3><p>Signed with your ML-DSA key. While it is open the contract blocks BTC spends, listing and transfer of this box.</p></div></div>
      <div className="form">
        <div className="form-grid form-grid-3">
          <Field label="Strike (USD)"><input value={strike} onChange={e=>setStrike(e.target.value)} inputMode="decimal"/></Field>
          <Field label="Size (sats)"><input value={size} onChange={e=>setSize(e.target.value)} inputMode="numeric"/></Field>
          <Field label="Term (hours)"><input value={hours} onChange={e=>setHours(e.target.value)} inputMode="numeric"/></Field>
          <Field label="Opening premium (USDC)"><input value={opening} onChange={e=>setOpening(e.target.value)} inputMode="decimal"/></Field>
          <Field label="Minimum premium (USDC)"><input value={minimum} onChange={e=>setMinimum(e.target.value)} inputMode="decimal"/></Field>
        </div>
        <p className="warn-line"><Icon name="shield"/> This browser checks the Bitcoin collateral against the live UTXO service. NEAR cannot independently verify Bitcoin ownership.</p>
        <button className="btn btn-primary" onClick={write} disabled={busy}>Sign and write call</button>
      </div>
    </div>}
    {history.length>0&&<div className="card">
      <div className="card-head"><div><h3>Call history</h3></div></div>
      <ul className="history">{history.slice().reverse().map(c=><li key={c.id}><b>#{c.id}</b><Chip tone={c.state==='paid'?'ok':'idle'}>{c.state}</Chip><span>{c.premium_paid_usdc?`${decimal(c.premium_paid_usdc)} USDC paid`:'no premium paid'}</span><small>{date(c.opened_ns)}</small></li>)}</ul>
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
