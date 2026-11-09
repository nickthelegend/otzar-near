import { useState } from 'react';
import { useBoxes, useNow, useRounds } from './data';
import { contractId, navigate, nearblocksTx, roundPhase, short, ZERO_ETH, type Box, type Round } from './lib';
import { Field, Icon, Link, Sheet, State } from './ui';
import { sendCall, type Wallet } from './wallet';

function toWei(eth: string) { if (!/^\d+(\.\d{1,18})?$/.test(eth.trim())) throw new Error('Enter the daily cap in ETH, e.g. 0.01'); const [w, f = ''] = eth.trim().split('.'); const v = BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18)); if (v <= 0n) throw new Error('Daily cap must be above zero'); return v.toString(); }

/** One vault NFT as a safe-deposit drawer: label plate, key-lock tumblers, and its latest round if it has one. */
export function Drawer({ b, account, round, now }: { b: Box; account: string; round?: Round; now: number }) {
  const sealed = !!b.pq_key?.length; const policy = b.policy.recovery_eth !== ZERO_ETH;
  const ph = round ? roundPhase(round, now) : null;
  return <Link to={`/vault/${b.token_id}`} className={`drawer ${sealed ? 'd-sealed' : ''} ${b.owner_id === account ? 'd-mine' : ''} ${round?.premium_paid_usdc ? 'd-earned' : ''}`} title={b.token_id}>
    <span className="drawer-plate"><b>{b.token_id}</b><small>{b.owner_id === account ? 'Yours' : short(b.owner_id, 12, 6)}</small></span>
    <span className="drawer-lock" aria-hidden="true"><i /></span>
    <span className="drawer-foot"><span className="drawer-tumblers" aria-label={`${sealed ? 'ML-DSA key set' : 'no ML-DSA key'}, ${policy ? 'rules set' : 'rules not set'}, ${b.ever_signed ? 'has signed' : 'never signed'}`}>
      <i className={sealed ? 'on' : ''} title="ML-DSA key" /><i className={policy ? 'on' : ''} title="Spending rules" /><i className={b.ever_signed ? 'on' : ''} title="Has issued an MPC signature" />
    </span>
    {ph ? <span className={`drawer-tag tag-${ph.phase}`}>#{round!.id} · {ph.short}</span> : b.listed_yocto ? <span className="drawer-tag tag-live">Listed</span> : null}</span>
  </Link>;
}

function MintSheet({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const [id, setId] = useState(''); const [guardian, setGuardian] = useState(''); const [recovery, setRecovery] = useState(''); const [cap, setCap] = useState('0.01'); const [allow, setAllow] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  async function mint() {
    setBusy(true); setErr('');
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!/^[a-z0-9-]{3,48}$/.test(id)) throw new Error('Box ID: 3–48 lowercase letters, digits and dashes');
      if (!guardian || !/^0x[0-9a-fA-F]{40}$/.test(recovery)) throw new Error('Enter a guardian account and a valid recovery ETH address');
      const policy = { daily_eth_wei: toWei(cap), delay_sec: 120, allow_eth: allow ? allow.split(',').map(x => x.trim()).filter(Boolean) : [], guardian, recovery_eth: recovery, emergency_migration: null };
      const h = await sendCall(wallet, contractId, 'mint', { token_id: id, policy });
      setHash(h); if (h) navigate(`/vault/${id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <Sheet label="Mint a vault" onClose={onClose}>
    <p className="lbl">New vault NFT</p>
    <h2 className="sheet-h">Mint a box<span> with its own BTC, ETH and SOL addresses</span></h2>
    <p className="sheet-note">Seal it with an ML-DSA-65 key right after minting, from the vault page. The rules below bind the Ethereum side first; Bitcoin rules are set on the vault.</p>
    <form className="sheet-form" onSubmit={e => { e.preventDefault(); mint(); }}>
      <Field label="Box ID" hint="Lowercase letters, digits and dashes"><input value={id} onChange={e => setId(e.target.value.toLowerCase())} placeholder="my-box" autoComplete="off" /></Field>
      <Field label="Guardian NEAR account"><input value={guardian} onChange={e => setGuardian(e.target.value)} placeholder="guardian.testnet" autoComplete="off" /></Field>
      <Field label="Recovery ETH address"><input value={recovery} onChange={e => setRecovery(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>
      <div className="form-grid"><Field label="Daily cap (ETH)"><input value={cap} onChange={e => setCap(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Allowlist" hint="Optional, comma separated"><input value={allow} onChange={e => setAllow(e.target.value)} placeholder="0x…" spellCheck={false} /></Field></div>
      {err && <p className="err-line" role="alert">{err}</p>}
      {hash && <p className="ok-line">Minted. <a href={nearblocksTx(hash)} target="_blank" rel="noreferrer">View on NearBlocks <Icon name="external" size={12} /></a></p>}
      {wallet.account ? <button className="pill pill-ice pill-block" type="submit" disabled={busy}>{busy ? 'Signing…' : 'Mint on NEAR testnet'}</button>
        : <button className="pill pill-ice pill-block" type="button" onClick={wallet.connect} disabled={!wallet.ready}>Connect a NEAR testnet wallet</button>}
    </form>
  </Sheet>;
}

export default function Vaults({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const now = useNow(15000);
  const [mine, setMine] = useState(false); const [mint, setMint] = useState(false);
  const list = (boxes.data || []).filter(b => !mine || b.owner_id === wallet.account);
  const latest = (id: string) => rounds.data?.find(r => r.token_id === id);
  const sealed = boxes.data?.filter(b => b.pq_key?.length).length;
  return <div className="page vaults">
    <header className="wall-head">
      <div>
        <p className="lbl">The wall · vault NFTs on {contractId ? <span className="mono">{contractId}</span> : 'NEAR testnet'}</p>
        <h1>{boxes.data ? <>{boxes.data.length} boxes.<span> {sealed} sealed with a quantum key.</span></> : 'Reading the wall…'}</h1>
      </div>
      <div className="wall-tools">
        <div className="filters" role="tablist" aria-label="Which vaults">
          <button role="tab" aria-selected={!mine} className={!mine ? 'on' : ''} onClick={() => setMine(false)}>All<small>{boxes.data?.length ?? ''}</small></button>
          <button role="tab" aria-selected={mine} className={mine ? 'on' : ''} onClick={() => setMine(true)}>Yours<small>{wallet.account && boxes.data ? boxes.data.filter(b => b.owner_id === wallet.account).length : ''}</small></button>
        </div>
        <button className="pill pill-ice" onClick={() => setMint(true)}><Icon name="plus" size={16} /> New box</button>
      </div>
    </header>
    <div className="legend" aria-hidden="true"><span><i className="on" />ML-DSA key</span><span><i className="on" />Spending rules</span><span><i className="on" />Has signed</span></div>
    {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults" action={<button className="pill pill-ghost pill-sm" onClick={boxes.reload}>Retry</button>}>{boxes.error}</State>
      : !boxes.data ? <div className="wall">{Array.from({ length: 8 }, (_, i) => <div key={i} className="drawer skeleton" />)}</div>
      : list.length ? <div className="wall">{list.map(b => <Drawer key={b.token_id} b={b} account={wallet.account} round={latest(b.token_id)} now={now} />)}</div>
      : <State kind="empty" title={mine ? (wallet.account ? 'You own no vaults yet' : 'Connect to see your vaults') : 'No vaults minted'} action={mine && !wallet.account ? <button className="pill pill-ice pill-sm" onClick={wallet.connect}>Connect</button> : <button className="pill pill-ice pill-sm" onClick={() => setMint(true)}>Mint the first box</button>}>Each vault is an NFT on NEAR that owns native Bitcoin, Ethereum and Solana addresses through Chain Signatures.</State>}
    {mint && <MintSheet wallet={wallet} onClose={() => setMint(false)} />}
  </div>;
}
