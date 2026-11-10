import { useState } from 'react';
import { contractId, navigate, nearblocksTx } from './lib';
import { Field, Icon, Sheet } from './ui';
import { sendCall, type Wallet } from './wallet';

function toWei(eth: string) { if (!/^\d+(\.\d{1,18})?$/.test(eth.trim())) throw new Error('Enter the daily cap in ETH, e.g. 0.01'); const [w, f = ''] = eth.trim().split('.'); const v = BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18)); if (v <= 0n) throw new Error('Daily cap must be above zero'); return v.toString(); }

/** Mint a vault NFT on NEAR testnet with its first spending rules. */
export function MintSheet({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const [id, setId] = useState(''); const [guardian, setGuardian] = useState(''); const [recovery, setRecovery] = useState(''); const [cap, setCap] = useState('0.01'); const [allow, setAllow] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  async function mint() {
    setBusy(true); setErr('');
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!/^[a-z0-9-]{3,48}$/.test(id)) throw new Error('Vault ID: 3–48 lowercase letters, digits and dashes');
      if (!guardian || !/^0x[0-9a-fA-F]{40}$/.test(recovery)) throw new Error('Enter a guardian account and a valid recovery ETH address');
      const policy = { daily_eth_wei: toWei(cap), delay_sec: 120, allow_eth: allow ? allow.split(',').map(x => x.trim()).filter(Boolean) : [], guardian, recovery_eth: recovery, emergency_migration: null };
      const h = await sendCall(wallet, contractId, 'mint', { token_id: id, policy });
      setHash(h); if (h) navigate(`/vault/${id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <Sheet label="Mint a vault" onClose={onClose}>
    <p className="lbl">New vault NFT</p>
    <h2 className="sheet-h">Mint a vault<span> with its own BTC, ETH and SOL addresses</span></h2>
    <p className="sheet-note">Seal it with an ML-DSA-65 key right after minting, from the vault page. The rules below bind the Ethereum side first; Bitcoin rules are set on the vault.</p>
    <form className="sheet-form" onSubmit={e => { e.preventDefault(); mint(); }}>
      <Field label="Vault ID" hint="Lowercase letters, digits and dashes"><input value={id} onChange={e => setId(e.target.value.toLowerCase())} placeholder="my-vault" autoComplete="off" /></Field>
      <Field label="Guardian NEAR account"><input value={guardian} onChange={e => setGuardian(e.target.value)} placeholder="guardian.testnet" autoComplete="off" /></Field>
      <Field label="Recovery ETH address"><input value={recovery} onChange={e => setRecovery(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>
      <div className="form-grid"><Field label="Daily cap (ETH)"><input value={cap} onChange={e => setCap(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Allowlist" hint="Optional, comma separated"><input value={allow} onChange={e => setAllow(e.target.value)} placeholder="0x…" spellCheck={false} /></Field></div>
      {err && <p className="err-line" role="alert">{err}</p>}
      {hash && <p className="ok-line">Minted. <a href={nearblocksTx(hash)} target="_blank" rel="noreferrer">View on NearBlocks <Icon name="external" size={12} /></a></p>}
      {wallet.account ? <button className="pill pill-jade pill-block" type="submit" disabled={busy}>{busy ? 'Signing…' : 'Mint on NEAR testnet'}</button>
        : <button className="pill pill-jade pill-block" type="button" onClick={wallet.connect} disabled={!wallet.ready}>Connect a NEAR testnet wallet</button>}
    </form>
  </Sheet>;
}

