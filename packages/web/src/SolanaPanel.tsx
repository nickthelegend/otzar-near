import { useEffect, useState } from 'react';
import { broadcastSolana, rpcQuery, signAuthorization, signedSolanaTransaction, solanaAddress, solanaBalance, solanaBlockhash, unsignedSolanaTransfer, verifyAuthorization } from '@hako/sdk';
import bs58 from 'bs58';
import { solanaUrl as rpc } from './lib';
import { Chip, Empty, Field, Icon, Timeline } from './ui';

type Box = { token_id: string; owner_id: string; epoch: number; nonce: number; pq_key: number[] | null };
type SolState = { public_key: string; spend: null | { message_hex: string; destination: string; lamports: string; state: string; signature_json: string | null } };
type Props = { view: 'rules' | 'send'; box: Box; contractId: string; account: string; keyFile: File | null; busy: boolean; invoke: (method: string, args: object) => Promise<void>; run: (fn: () => Promise<void>) => Promise<void> };
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export default function SolanaPanel({ view, box, contractId, account, keyFile, busy, invoke, run }: Props) {
  const [address, setAddress] = useState(''); const [balance, setBalance] = useState('—');
  const [state, setState] = useState<SolState | null>(null); const [destination, setDestination] = useState(''); const [amount, setAmount] = useState('0.01');
  const [message, setMessage] = useState('');
  async function refresh() {
    const [derived, onChain] = await Promise.all([solanaAddress(contractId, box.token_id, box.epoch), rpcQuery(contractId, 'sol_state', { token_id: box.token_id })]);
    setAddress(derived); setState(onChain);
    try { if (!rpc) throw new Error('not configured'); setBalance(`${(Number(await solanaBalance(derived, rpc))/1e9).toFixed(6)} SOL`); }
    catch (error) { setBalance(`Setup required: VITE_SOLANA_RPC_URL (${(error as Error).message})`); }
  }
  useEffect(() => { refresh().catch(error => setMessage((error as Error).message)); }, [box.token_id, box.epoch, box.nonce]);
  async function authorize(data: Uint8Array) {
    if (!keyFile) throw new Error('Setup required: ML_DSA_KEY file');
    const file = JSON.parse(await keyFile.text());
    const secret = Buffer.from(file.secretKey, 'base64');
    const signature = signAuthorization(secret, box.token_id, box.nonce, data);
    if (!verifyAuthorization(Uint8Array.from(box.pq_key || []), signature, box.token_id, box.nonce, data)) throw new Error('Key file does not match this vault');
    return base64(signature);
  }
  const owner = box.owner_id === account;
  const mismatch = !!state && !!address && state.public_key !== base64(bs58.decode(address));
  if (view === 'rules') return <div className="card">
    <div className="card-head"><div><h3>Solana address</h3><p>Registers the vault's Ed25519 address, signed by your ML-DSA key. SOL transfers sign immediately: the ETH/BTC delay does not apply.</p></div>{state ? <Chip tone={mismatch ? 'bad' : 'ok'}>{mismatch ? 'Mismatch' : 'Registered'}</Chip> : <Chip tone="warn">Not registered</Chip>}</div>
    {message && <p className="inline-note">{message}</p>}
    <dl className="kv"><div><dt>Address</dt><dd><code>{address || 'Deriving Ed25519 address…'}</code></dd></div><div><dt>Balance</dt><dd>{balance}</dd></div></dl>
    {mismatch && <p className="inline-error">Registered SOL key differs from the MPC derivation. Do not fund it.</p>}
    {!state && owner && <button className="btn btn-primary" disabled={busy || !address} onClick={() => run(async () => { await invoke('register_sol', { token_id: box.token_id, public_key: base64(bs58.decode(address)), nonce: box.nonce, signature: await authorize(bs58.decode(address)) }); await refresh(); })}>Sign and register SOL address</button>}
  </div>;
  const spend = state?.spend;
  return <>
    <div className="card">
      <div className="card-head"><div><h3>Send SOL</h3><p>Solana blockhashes expire quickly, so SOL spends sign right away. Balance {balance}.</p></div></div>
      {message && <p className="inline-note">{message}</p>}
      {!state ? <p className="fineprint">Register the Solana address first (Rules tab).</p> : !owner ? <p className="fineprint">Only the owner can request a spend.</p> : <div className="form">
        <div className="form-grid">
          <Field label="Destination"><input aria-label="Solana destination" placeholder="Base58 address" value={destination} onChange={event => setDestination(event.target.value)} spellCheck={false} /></Field>
          <Field label="Amount (SOL)"><input aria-label="SOL amount" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" /></Field>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { if (!rpc) throw new Error('Setup required: VITE_SOLANA_RPC_URL'); const lamports = BigInt(Math.round(Number(amount) * 1e9)); const messageHex = unsignedSolanaTransfer(address, destination, lamports, await solanaBlockhash(rpc)); await invoke('request_sol_spend', { token_id: box.token_id, message_hex: messageHex, nonce: box.nonce, signature: await authorize(Buffer.from(messageHex, 'hex')) }); await refresh(); })}><Icon name="send" /> Sign and request spend</button>
      </div>}
    </div>
    <div className="card">
      <div className="card-head"><div><h3>SOL spend</h3><p>One open SOL request per vault.</p></div></div>
      {!spend ? <Empty icon="clock" title="No SOL spend request" /> : <Timeline clock={Date.now()} items={[{ key: 'sol', chain: 'SOL', state: spend.state, title: `${(Number(BigInt(spend.lamports)) / 1e9).toFixed(6)} SOL → ${bs58.encode(Buffer.from(spend.destination, 'base64'))}`, actions: <>
        {spend.state === 'pending' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => { await invoke('execute_sol', { token_id: box.token_id }); await refresh(); })}>Sign via NEAR MPC</button>}
        {spend.state === 'signed' && spend.signature_json && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => { if (!rpc) throw new Error('Setup required: VITE_SOLANA_RPC_URL'); const raw = signedSolanaTransaction(spend.message_hex, spend.signature_json!, address); const hash = await broadcastSolana(raw, rpc); setMessage(`Solana validator accepted ${hash}`); await refresh(); })}>Broadcast to validator</button>}
      </> }]} />}
    </div>
  </>;
}
