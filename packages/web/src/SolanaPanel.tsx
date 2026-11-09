import { useEffect, useState } from 'react';
import { broadcastSolana, rpcQuery, signAuthorization, signedSolanaTransaction, solanaAddress, solanaBalance, solanaBlockhash, unsignedSolanaTransfer, verifyAuthorization } from '@hako/sdk';
import bs58 from 'bs58';

type Box = { token_id: string; owner_id: string; epoch: number; nonce: number; pq_key: number[] | null };
type SolState = { public_key: string; spend: null | { message_hex: string; destination: string; lamports: string; state: string; signature_json: string | null } };
type Props = { box: Box; contractId: string; account: string; keyFile: File | null; busy: boolean; invoke: (method: string, args: object) => Promise<void>; run: (fn: () => Promise<void>) => Promise<void> };
const rpc = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || 'http://127.0.0.1:8899';
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export default function SolanaPanel({ box, contractId, account, keyFile, busy, invoke, run }: Props) {
  const [address, setAddress] = useState(''); const [balance, setBalance] = useState('—');
  const [state, setState] = useState<SolState | null>(null); const [destination, setDestination] = useState(''); const [amount, setAmount] = useState('0.01');
  const [message, setMessage] = useState('');
  async function refresh() {
    const [derived, onChain] = await Promise.all([solanaAddress(contractId, box.token_id, box.epoch), rpcQuery(contractId, 'sol_state', { token_id: box.token_id })]);
    setAddress(derived); setState(onChain);
    try { setBalance(`${(Number(await solanaBalance(derived, rpc))/1e9).toFixed(6)} SOL`); }
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
  return <div className="solana-panel"><h4>Solana · local validator</h4><div className="balance-line"><strong>{balance}</strong><code>{address || 'Deriving Ed25519 address…'}</code></div>{message && <p className="notice">{message}</p>}{!state && box.owner_id === account && <button disabled={busy || !address} onClick={() => run(async () => { await invoke('register_sol', { token_id: box.token_id, public_key: base64(bs58.decode(address)), nonce: box.nonce, signature: await authorize(bs58.decode(address)) }); await refresh(); })}>Register SOL address</button>}{state && state.public_key !== base64(bs58.decode(address)) && <p className="notice error">Registered SOL key differs from MPC derivation. Do not fund it.</p>}{state && box.owner_id === account && <div className="send"><h5>Send SOL</h5><input aria-label="Solana destination" placeholder="Solana destination" value={destination} onChange={event => setDestination(event.target.value)}/><input aria-label="SOL amount" placeholder="SOL amount" value={amount} onChange={event => setAmount(event.target.value)}/><button disabled={busy} onClick={() => run(async () => { const lamports = BigInt(Math.round(Number(amount) * 1e9)); const messageHex = unsignedSolanaTransfer(address, destination, lamports, await solanaBlockhash(rpc)); await invoke('request_sol_spend', { token_id: box.token_id, message_hex: messageHex, nonce: box.nonce, signature: await authorize(Buffer.from(messageHex, 'hex')) }); await refresh(); })}>Request SOL spend</button></div>}{state?.spend && <div className="request"><span className="request-id">SOL · {state.spend.state}</span><strong>{(Number(BigInt(state.spend.lamports))/1e9).toFixed(6)} SOL → {bs58.encode(Buffer.from(state.spend.destination, 'base64'))}</strong>{state.spend.state === 'pending' && <button disabled={busy} onClick={() => run(async () => { await invoke('execute_sol', { token_id: box.token_id }); await refresh(); })}>Sign via NEAR MPC</button>}{state.spend.state === 'signed' && state.spend.signature_json && <button disabled={busy} onClick={() => run(async () => { const raw = signedSolanaTransaction(state.spend!.message_hex, state.spend!.signature_json!, address); const hash = await broadcastSolana(raw, rpc); setMessage(`Solana validator accepted ${hash}`); await refresh(); })}>Broadcast to validator</button>}</div>}<small>Solana blockhashes expire quickly. SOL transfers sign immediately; the ETH/BTC delay policy does not apply to SOL.</small></div>;
}
