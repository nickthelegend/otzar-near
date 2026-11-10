import { Chip, Empty, Field, Icon, Timeline } from './ui';
import { useCallback, useEffect, useState } from 'react';
import { bitcoinAddressFromScript, bitcoinPrevout, bitcoinScriptHex, deriveAddresses, rpcQuery, signAuthorization, signedBitcoinTransaction, unsignedBitcoinSpend, verifyAuthorization } from '@hako/sdk';

type Box = {token_id:string;owner_id:string;epoch:number;nonce:number;pq_key:number[]|null;policy:{guardian:string}};
type Request = {id:number;raw_unsigned_hex:string;prevout_sats:string;outgoing_sats:string;ready_ns:number;state:string;signature_json:string|null;guardian_recovery:boolean};
type State = {epoch:number;current_pubkey_hex:string;next_pubkey_hex:string;next_registered_ns:number;policy:{daily_cap_sats:string;allow_scripts:string[];recovery_script:string};requests:Request[]};
type Props = {view:'rules'|'send';box:Box;contractId:string;bitcoinAddress:string;account:string;busy:boolean;clock:number;keyFile:File|null;invoke:(method:string,args:object,deposit?:string)=>Promise<void>;run:(fn:()=>Promise<void>)=>Promise<void>};
const endpoint=import.meta.env.VITE_BITCOIN_ESPLORA_URL as string|undefined;
const b64=(b:Uint8Array)=>Buffer.from(b).toString('base64');

export default function BitcoinPanel({view,box,contractId,bitcoinAddress,account,busy,clock,keyFile,invoke,run}:Props){
  const [state,setState]=useState<State|null>(null);
  const [allow,setAllow]=useState('');const [recovery,setRecovery]=useState('');const [cap,setCap]=useState('9999500');
  const [destination,setDestination]=useState('');const [amount,setAmount]=useState('');const [message,setMessage]=useState('');
  const load=useCallback(async()=>{setState(await rpcQuery(contractId,'btc_state',{token_id:box.token_id}) as State|null);},[contractId,box.token_id]);
  useEffect(()=>{load().catch(e=>setMessage((e as Error).message));},[load,Math.floor(clock/15000)]);
  async function secret(){if(!keyFile)throw new Error('Setup required: ML_DSA_KEY file');const file=JSON.parse(await keyFile.text());if(typeof file.secretKey!=='string')throw new Error('Invalid ML-DSA key file');return Buffer.from(file.secretKey,'base64');}
  function sign(data:Uint8Array,secretKey:Uint8Array){const signature=signAuthorization(secretKey,box.token_id,box.nonce,data);if(!verifyAuthorization(Uint8Array.from(box.pq_key||[]),signature,box.token_id,box.nonce,data))throw new Error('ML-DSA key file does not match vault');return b64(signature);}
  async function fetchUtxos(){if(!endpoint)throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');const r=await fetch(`${endpoint}/address/${bitcoinAddress}`);if(!r.ok)throw new Error(`Bitcoin service HTTP ${r.status}`);const j=await r.json();if(j.error)throw new Error(j.error);if(!Array.isArray(j.utxos))throw new Error('Bitcoin UTXO service required');return j.utxos as {txid:string;vout:number;sats:string}[];}
  async function register(){await run(async()=>{const key=await secret();if(!allow||!recovery)throw new Error('Enter allowlist and recovery Bitcoin addresses');const derived=await deriveAddresses(contractId,box.token_id,state?.epoch||0);const next=await deriveAddresses(contractId,box.token_id,(state?.epoch||0)+1);const policy={daily_cap_sats:cap,allow_scripts:[bitcoinScriptHex(allow)],recovery_script:bitcoinScriptHex(recovery)};const data=Buffer.from(JSON.stringify([derived.bitcoinPublicKey,next.bitcoinPublicKey,policy]));await invoke('register_btc',{token_id:box.token_id,current_pubkey_hex:derived.bitcoinPublicKey,next_pubkey_hex:next.bitcoinPublicKey,policy,nonce:box.nonce,signature:sign(data,key)});await load();});}
  async function request(){await run(async()=>{if(!state)throw new Error('Register Bitcoin policy first');const key=await secret();const current=await deriveAddresses(contractId,box.token_id,state.epoch);const next=await deriveAddresses(contractId,box.token_id,state.epoch+1);if(state.current_pubkey_hex!==current.bitcoinPublicKey||state.next_pubkey_hex!==next.bitcoinPublicKey)throw new Error('Registered Bitcoin keys do not match MPC derivation');const utxos=await fetchUtxos();if(utxos.length!==1)throw new Error(`Expected one UTXO at this epoch; found ${utxos.length}`);const utxo=utxos[0];const prevoutSats=BigInt(utxo.sats);const fee=1000n;const amountSats=amount.trim()?BigInt(amount):prevoutSats-fee;const transaction=unsignedBitcoinSpend({txid:utxo.txid,vout:utxo.vout,prevoutSats,destination,amountSats,feeSats:fee,changeAddress:next.bitcoin});const data=Buffer.concat([Buffer.from(transaction.rawHex,'hex'),Buffer.alloc(8)]);data.writeBigUInt64LE(prevoutSats,data.length-8);await invoke('request_btc_spend',{token_id:box.token_id,raw_unsigned_hex:transaction.rawHex,prevout_sats:prevoutSats.toString(),nonce:box.nonce,signature:sign(data,key)});await load();});}
  async function clawback(request:Request){await run(async()=>{if(!state)throw new Error('Bitcoin vault unavailable');const previous=bitcoinPrevout(request.raw_unsigned_hex);const value=BigInt(request.prevout_sats);const destination=bitcoinAddressFromScript(state.policy.recovery_script);const tx=unsignedBitcoinSpend({txid:previous.txid,vout:previous.vout,prevoutSats:value,destination,amountSats:value-1000n,feeSats:1000n});await invoke('guardian_clawback_btc',{token_id:box.token_id,request_id:request.id,recovery_tx_hex:tx.rawHex});await load();});}
  async function broadcast(request:Request){await run(async()=>{if(!endpoint)throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');if(!state||!request.signature_json)throw new Error('MPC signature unavailable');const raw=signedBitcoinTransaction(request.raw_unsigned_hex,request.signature_json,state.current_pubkey_hex);const r=await fetch(`${endpoint}/broadcast`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rawHex:raw})});const result=await r.json();if(!r.ok||result.error)throw new Error(result.error||`Bitcoin service HTTP ${r.status}`);setMessage(`Bitcoin Core accepted ${result.txid}`);});}
  const owner=box.owner_id===account;
  const items=(state?.requests||[]).slice().reverse().map(r=>({key:`btc-${r.id}`,chain:'BTC' as const,recovery:r.guardian_recovery,state:r.state,title:`${Number(r.outgoing_sats).toLocaleString()} sats out`,detail:`request #${r.id} · prevout ${Number(r.prevout_sats).toLocaleString()} sats`,readyMs:r.ready_ns/1e6,actions:<>
    {r.state==='pending'&&r.ready_ns/1e6<=clock&&<button className="btn btn-primary btn-sm" onClick={()=>run(async()=>{await invoke('execute_btc',{token_id:box.token_id,request_id:r.id});await load();})} disabled={busy}>Sign via NEAR MPC</button>}
    {r.state==='pending'&&r.ready_ns/1e6>clock&&account===box.policy.guardian&&<button className="btn btn-danger btn-sm" onClick={()=>clawback(r)} disabled={busy}>Claw back BTC</button>}
    {r.state==='signed'&&<button className="btn btn-ghost btn-sm" onClick={()=>broadcast(r)} disabled={busy}>Broadcast to Bitcoin Core</button>}
  </>}));
  if(view==='rules') return <div className="card">
    <div className="card-head"><div><h3>Bitcoin rules</h3><p>The contract parses the real BIP143 transaction: cap, allowlist, recovery script and a fresh change key.</p></div>{state?<Chip tone="ok">Registered</Chip>:<Chip tone="warn">Not registered</Chip>}</div>
    {message&&<p className="inline-note">{message}</p>}
    {state?<dl className="kv">
      <div><dt>Daily cap</dt><dd>{Number(state.policy.daily_cap_sats).toLocaleString()} sats</dd></div>
      <div><dt>Key epoch</dt><dd>{state.epoch} · next change key waits 120s after registration</dd></div>
      <div><dt>Allowlisted scripts</dt><dd>{state.policy.allow_scripts.length?state.policy.allow_scripts.map(x=><code key={x}>{bitcoinAddressFromScript(x)}</code>):'None'}</dd></div>
      <div><dt>Recovery</dt><dd><code>{bitcoinAddressFromScript(state.policy.recovery_script)}</code></dd></div>
    </dl>:owner&&box.pq_key?<div className="form">
      <div className="form-grid">
        <Field label="Allowlisted regtest address"><input placeholder="bcrt1…" value={allow} onChange={e=>setAllow(e.target.value)} spellCheck={false}/></Field>
        <Field label="Recovery regtest address"><input placeholder="bcrt1…" value={recovery} onChange={e=>setRecovery(e.target.value)} spellCheck={false}/></Field>
        <Field label="Daily cap (sats)"><input value={cap} onChange={e=>setCap(e.target.value)} inputMode="numeric"/></Field>
      </div>
      <button className="btn btn-primary" onClick={register} disabled={busy}>Sign and register Bitcoin rules</button>
    </div>:<p className="fineprint">The owner registers Bitcoin rules after adding an ML-DSA key.</p>}
  </div>;
  return <>
    <div className="card">
      <div className="card-head"><div><h3>Send BTC</h3><p>Spends the vault's single UTXO; change goes to the next-epoch address.</p></div></div>
      {message&&<p className="inline-note">{message}</p>}
      {!state?<p className="fineprint">Register Bitcoin rules first (Rules tab).</p>:!owner?<p className="fineprint">Only the owner can request a spend.</p>:<div className="form">
        <div className="form-grid">
          <Field label="Destination"><input placeholder="bcrt1…" value={destination} onChange={e=>setDestination(e.target.value)} spellCheck={false}/></Field>
          <Field label="Amount (sats)" hint="Leave empty to sweep minus a 1,000 sat fee"><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="numeric"/></Field>
        </div>
        <button className="btn btn-primary" onClick={request} disabled={busy}><Icon name="send"/> Sign and request spend</button>
      </div>}
    </div>
    <div className="card">
      <div className="card-head"><div><h3>BTC spend requests</h3><p>Daily cap {state?`${Number(state.policy.daily_cap_sats).toLocaleString()} sats`:'not set'} · epoch {state?.epoch??'—'}</p></div></div>
      {items.length===0?<Empty icon="clock" title="No Bitcoin spend requests"/>:<Timeline items={items} clock={clock}/>}
    </div>
  </>;
}
