import { useEffect, useState } from 'react';
import { guardianConfigPayload, inheritancePayload, newQuantumKey, rpcQuery, signAuthorization, signGuardianApproval, verifyAuthorization } from '@hako/sdk';

type Box = { token_id: string; owner_id: string; nonce: number; pq_key: number[] | null };
type GuardianConfig = { keys: string[]; threshold: number; timelock_sec: number; recovery_nonce: number; pending_key: string | null; ready_ns: number | null };
type Inheritance = { heir: string; deadline_ns: number; delay_sec: number };
type Props = { box: Box; contractId: string; account: string; keyFile: File | null; busy: boolean; invoke: (method: string, args: object) => Promise<void>; run: (fn: () => Promise<void>) => Promise<void> };
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export default function VaultPolicyPanel({ box, contractId, account, keyFile, busy, invoke, run }: Props) {
  const [config, setConfig] = useState<GuardianConfig | null>(null); const [inheritance, setInheritance] = useState<Inheritance | null>(null);
  const [keysText, setKeysText] = useState(''); const [threshold, setThreshold] = useState('2'); const [timelock, setTimelock] = useState('86400');
  const [files, setFiles] = useState<File[]>([]); const [heir, setHeir] = useState(''); const [deadline, setDeadline] = useState(''); const [delay, setDelay] = useState('7'); const [error, setError] = useState('');
  async function refresh() { const [g,i] = await Promise.all([rpcQuery(contractId,'guardian_config',{token_id:box.token_id}),rpcQuery(contractId,'inheritance',{token_id:box.token_id})]); setConfig(g); setInheritance(i); }
  useEffect(() => { refresh().catch(e=>setError((e as Error).message)); }, [box.token_id, box.nonce]);
  async function ownerSignature(data: Uint8Array) {
    if (!keyFile) throw new Error('Setup required: ML_DSA_KEY file');
    const key = JSON.parse(await keyFile.text()); const secret = Buffer.from(key.secretKey,'base64');
    const signature = signAuthorization(secret,box.token_id,box.nonce,data);
    if (!verifyAuthorization(Uint8Array.from(box.pq_key||[]),signature,box.token_id,box.nonce,data)) throw new Error('Key file does not match this vault');
    return b64(signature);
  }
  async function configure() {
    const keys = keysText.split(/[\s,]+/).filter(Boolean); const decoded = keys.map(k=>Buffer.from(k,'base64'));
    const m=Number(threshold), seconds=Number(timelock);
    await invoke('set_guardians',{token_id:box.token_id,keys,threshold:m,timelock_sec:seconds,nonce:box.nonce,signature:await ownerSignature(guardianConfigPayload(box.token_id,decoded,m,seconds))}); await refresh();
  }
  async function initiate() {
    if (!config) throw new Error('Configure guardians first');
    const fresh = newQuantumKey();
    const payload=JSON.stringify({type:'hako-ml-dsa-65',publicKey:b64(fresh.publicKey),secretKey:b64(fresh.secretKey)});
    const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})); const anchor=document.createElement('a'); anchor.href=url;anchor.download=`hako-${box.token_id}-recovered-key.json`;anchor.click();URL.revokeObjectURL(url);
    const approvals=Array(config.keys.length).fill('');
    for(const file of files){const key=JSON.parse(await file.text());const index=config.keys.indexOf(key.publicKey);if(index>=0)approvals[index]=b64(signGuardianApproval(Buffer.from(key.secretKey,'base64'),box.token_id,box.owner_id,config.recovery_nonce,fresh.publicKey));}
    if(approvals.filter(Boolean).length<config.threshold)throw new Error(`Need ${config.threshold} guardian key files`);
    await invoke('initiate_pq_recovery',{token_id:box.token_id,new_key:b64(fresh.publicKey),approvals});await refresh();
  }
  async function configureHeir() {
    const deadlineSec=Math.floor(Date.parse(deadline)/1000); const delaySec=Number(delay)*86400;
    if(!Number.isSafeInteger(deadlineSec))throw new Error('Choose a valid heir deadline');
    await invoke('set_inheritance',{token_id:box.token_id,heir,deadline_sec:deadlineSec,delay_sec:delaySec,nonce:box.nonce,signature:await ownerSignature(inheritancePayload(box.token_id,heir,deadlineSec,delaySec))});await refresh();
  }
  return <div className="vault-policies" id="vault-policy"><h4>Recovery and inheritance</h4>{error&&<p className="notice error">{error}</p>}<div className="policy-block"><h5>ML-DSA guardians</h5>{config?<><p>{config.threshold} of {config.keys.length} guardians · {config.timelock_sec/3600}h timelock</p>{config.pending_key?<><p>Key rotation pending until {new Date((config.ready_ns||0)/1e6).toLocaleString()}.</p><button disabled={busy} onClick={()=>run(async()=>{await invoke('finalize_pq_recovery',{token_id:box.token_id});await refresh();})}>Finalize recovery</button>{box.owner_id===account&&<button disabled={busy} onClick={()=>run(async()=>{await invoke('cancel_pq_recovery',{token_id:box.token_id,nonce:box.nonce,signature:await ownerSignature(Buffer.from('cancel-pq-recovery'))});await refresh();})}>Cancel recovery</button>}</>:<><label>Guardian key files<input type="file" multiple accept=".json" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label><button disabled={busy} onClick={()=>run(initiate)}>Start guardian recovery</button></>}</>:<p>No guardians configured.</p>}{box.owner_id===account&&<div className="send"><label>Guardian public keys, base64 (one per line)<textarea value={keysText} onChange={e=>setKeysText(e.target.value)}/></label><label>Threshold<input type="number" min="2" max="5" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label><label>Timelock, seconds<input type="number" min="120" value={timelock} onChange={e=>setTimelock(e.target.value)}/></label><button disabled={busy} onClick={()=>run(configure)}>Set guardians</button></div>}</div><div className="policy-block"><h5>Heir</h5>{inheritance?<><p>{inheritance.heir} can claim after {new Date((inheritance.deadline_ns+inheritance.delay_sec*1e9)/1e6).toLocaleString()}.</p>{box.owner_id===account&&<><button disabled={busy} onClick={()=>run(async()=>{await invoke('check_in',{token_id:box.token_id,nonce:box.nonce,signature:await ownerSignature(Buffer.from('inheritance-check-in'))});await refresh();})}>Check in</button><button disabled={busy} onClick={()=>run(async()=>{await invoke('cancel_inheritance',{token_id:box.token_id,nonce:box.nonce,signature:await ownerSignature(Buffer.from('inheritance-cancel'))});await refresh();})}>Cancel heir</button></>}{inheritance.heir===account&&<button disabled={busy} onClick={()=>run(async()=>{await invoke('claim_inheritance',{token_id:box.token_id});await refresh();})}>Claim inherited NFT</button>}</>:<p>No heir set.</p>}{box.owner_id===account&&<div className="send"><input placeholder="Heir NEAR account" value={heir} onChange={e=>setHeir(e.target.value)}/><label>Check-in deadline<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Claim delay, days<input type="number" min="1" max="30" value={delay} onChange={e=>setDelay(e.target.value)}/></label><button disabled={busy} onClick={()=>run(configureHeir)}>Set heir</button></div>}</div></div>;
}
