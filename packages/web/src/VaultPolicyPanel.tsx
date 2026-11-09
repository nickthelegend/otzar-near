import { Chip, Empty, Field, Icon } from './ui';
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
  const owner = box.owner_id === account;
  return <>
    {error && <p className="inline-error">{error}</p>}
    <div className="card">
      <div className="card-head"><div><h3>Post-quantum guardians</h3><p>M-of-N guardians, each with their own ML-DSA key, can rotate a lost authority key after a timelock. You can cancel during the timelock.</p></div>{config ? <Chip tone={config.pending_key ? 'warn' : 'ok'}>{config.pending_key ? 'Rotation pending' : `${config.threshold} of ${config.keys.length}`}</Chip> : <Chip>Not set</Chip>}</div>
      {config ? <>
        <dl className="kv"><div><dt>Threshold</dt><dd>{config.threshold} of {config.keys.length} guardians</dd></div><div><dt>Timelock</dt><dd>{config.timelock_sec / 3600}h</dd></div><div><dt>Recovery nonce</dt><dd>{config.recovery_nonce}</dd></div></dl>
        {config.pending_key ? <div className="form"><p className="warn-line"><Icon name="clock" /> Key rotation pending until {new Date((config.ready_ns || 0) / 1e6).toLocaleString()}.</p><div className="btn-row"><button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { await invoke('finalize_pq_recovery', { token_id: box.token_id }); await refresh(); })}>Finalize recovery</button>{owner && <button className="btn btn-danger" disabled={busy} onClick={() => run(async () => { await invoke('cancel_pq_recovery', { token_id: box.token_id, nonce: box.nonce, signature: await ownerSignature(Buffer.from('cancel-pq-recovery')) }); await refresh(); })}>Cancel recovery</button>}</div></div>
          : <div className="form"><Field label="Guardian key files" hint="Select at least the threshold of guardian ML-DSA key files. A fresh owner key downloads first."><input type="file" multiple accept=".json" onChange={e => setFiles(Array.from(e.target.files || []))} /></Field><button className="btn btn-ghost" disabled={busy} onClick={() => run(initiate)}>Start guardian recovery</button></div>}
      </> : <Empty icon="shield" title="No guardians configured" />}
      {owner && <div className="form">
        <h4>{config ? 'Replace guardians' : 'Set guardians'}</h4>
        <Field label="Guardian public keys (base64, one per line)"><textarea value={keysText} onChange={e => setKeysText(e.target.value)} spellCheck={false} /></Field>
        <div className="form-grid"><Field label="Threshold"><input type="number" min="2" max="5" value={threshold} onChange={e => setThreshold(e.target.value)} /></Field><Field label="Timelock (seconds)"><input type="number" min="120" value={timelock} onChange={e => setTimelock(e.target.value)} /></Field></div>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(configure)}>Sign and set guardians</button>
      </div>}
    </div>
    <div className="card">
      <div className="card-head"><div><h3>Heir</h3><p>Check in before your deadline. If you don't, the heir can claim the NFT after the delay.</p></div>{inheritance ? <Chip tone="ok">Set</Chip> : <Chip>Not set</Chip>}</div>
      {inheritance ? <>
        <dl className="kv"><div><dt>Heir</dt><dd><code>{inheritance.heir}</code></dd></div><div><dt>Can claim after</dt><dd>{new Date((inheritance.deadline_ns + inheritance.delay_sec * 1e9) / 1e6).toLocaleString()}</dd></div></dl>
        <div className="btn-row">
          {owner && <><button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { await invoke('check_in', { token_id: box.token_id, nonce: box.nonce, signature: await ownerSignature(Buffer.from('inheritance-check-in')) }); await refresh(); })}>Check in</button><button className="btn btn-danger" disabled={busy} onClick={() => run(async () => { await invoke('cancel_inheritance', { token_id: box.token_id, nonce: box.nonce, signature: await ownerSignature(Buffer.from('inheritance-cancel')) }); await refresh(); })}>Remove heir</button></>}
          {inheritance.heir === account && <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { await invoke('claim_inheritance', { token_id: box.token_id }); await refresh(); })}>Claim inherited box</button>}
        </div>
      </> : <Empty icon="heir" title="No heir set" />}
      {owner && <div className="form">
        <h4>{inheritance ? 'Change heir' : 'Set an heir'}</h4>
        <div className="form-grid form-grid-3"><Field label="Heir NEAR account"><input placeholder="heir.testnet" value={heir} onChange={e => setHeir(e.target.value)} /></Field><Field label="Check-in deadline"><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field><Field label="Claim delay (days)"><input type="number" min="1" max="30" value={delay} onChange={e => setDelay(e.target.value)} /></Field></div>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(configureHeir)}>Sign and set heir</button>
      </div>}
    </div>
  </>;
}
