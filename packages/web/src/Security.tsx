import { useEffect, useState } from 'react';
import { AttackerPanel, Card, LockBadge, PROOF, Stat, v3art } from './blocks';
import { useBoxes } from './data';
import { fingerprintOf, keyForVault, loadKeyFile, useKeys } from './keys';
import { useAccessKeys, useCodeHash, useNearBlock } from './live';
import { contractId, isPublicVault, nearblocksAccount, nearblocksTx, short, type Box } from './lib';
import { PageHead } from './shell';
import { CountUp } from './art';
import { Icon, Link } from './ui';
import type { Wallet } from './wallet';

const UPGRADE_HASH = '2c60b11496a1b294aae6f5e29a12fb1682a398e8c81741f1b1d782367cd3641b';
const PROTECTED: [string, string, string][] = [
  ['Spend Bitcoin, ETH or SOL', 'request_btc_spend · request_eth_spend · request_sol_spend', 'ML-DSA signature over the exact unsigned transaction, nonce, daily cap, delay'],
  ['Transfer the vault NFT', 'nft_transfer', 'ML-DSA signature over the receiver, new since Nov 13'],
  ['List the vault for sale', 'list', 'ML-DSA signature over the price, new since Nov 13'],
  ['Write a covered call', 'write_call', 'ML-DSA signature over strike, size, expiry, premiums and the Bitcoin UTXO'],
  ['Change rules, guardians or heir', 'set_policy · register_btc · set_guardians · set_inheritance', 'ML-DSA signature and nonce'],
  ['Recover a lost key', 'initiate_pq_recovery · finalize_pq_recovery', 'Two of three ML-DSA guardians, then a time lock the owner can cancel'],
];
const LIVE_PROOF: [string, string, string][] = [
  ['Owner’s NEAR key alone tries to transfer a locked vault', PROOF.transfer, 'quantum lock: ML-DSA signature required'],
  ['Transfer with a forged ML-DSA signature', PROOF.forgedTransfer, 'bad ML-DSA signature'],
  ['Owner’s NEAR key alone tries to list it for sale', PROOF.list, 'quantum lock: ML-DSA signature required'],
  ['Spend signed with the wrong ML-DSA key', PROOF.wrongKeySpend, 'bad ML-DSA signature'],
  ['Replay of an already used signature', PROOF.nonceReplay, 'bad nonce'],
  ['Key recovery with one guardian of three', PROOF.guardianRejected, 'guardian threshold not met'],
  ['Recovery finalised before its time lock', PROOF.earlyFinalize, 'recovery timelock active'],
];

function VaultKeyRow({ b }: { b: Box }) {
  const [fp, setFp] = useState(''); useKeys();
  useEffect(() => { if (b.pq_key) fingerprintOf(Uint8Array.from(b.pq_key)).then(setFp); }, [b.pq_key?.length]);
  const k = keyForVault(b.pq_key);
  return <div className="o-tr o-tr-keys">
    <span className="o-vault"><img src={v3art('otzar-icon-128')} alt="" width="32" height="32" /><span><b>{short(b.token_id, 20, 6)}</b><small>{b.nonce} signatures used</small></span></span>
    <span data-label="Lock"><LockBadge box={b} /></span>
    <span className="mono small" data-label="Key">{b.pq_key ? fp || '…' : '—'}</span>
    <span data-label="This tab">{k ? <span className="o-ok"><Icon name="check" size={13} /> Key file loaded</span> : b.pq_key ? <span className="dim">Not loaded</span> : <Link to={`/vault/${encodeURIComponent(b.token_id)}`} className="o-link">Lock it <Icon name="arrow" size={12} /></Link>}</span>
  </div>;
}

export default function Security({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const keys = useAccessKeys(contractId); const code = useCodeHash(contractId); const block = useNearBlock();
  const pub = boxes.data?.filter(b => isPublicVault(b.token_id)) || null;
  const locked = pub?.filter(b => b.pq_key).length ?? null;
  const mine = (boxes.data || []).filter(b => b.owner_id === wallet.account);
  const [err, setErr] = useState('');

  return <div className="o-page">
    <PageHead title="Quantum security" sub="What protects your vault, checked live, and where the protection stops." />
    <section className="o-pq-hero">
      <div className="o-pq-hero-copy">
        <span className="o-pq-status"><i aria-hidden="true" />{code.data ? (code.data.hash === UPGRADE_HASH ? 'Quantum-locked ownership is live' : 'Contract code changed since this page was built') : 'Reading the contract…'}</span>
        <h2>Your Bitcoin answers to a post&#8209;quantum key.</h2>
        <p>Every vault has a second lock: an <b>ML-DSA-65</b> key (NIST FIPS 204). The Otzar contract verifies it on NEAR with <code>env::ml_dsa_verify</code> before it lets anything move, change hands or change its rules.</p>
        <div className="o-pq-facts">
          <Stat k="Vaults locked" v={locked !== null && pub ? <><CountUp value={locked} decimals={0} /><small>/{pub.length}</small></> : '…'} />
          <Stat k="Signature checked" v="3,309 B" sub="ML-DSA-65, per action" />
          <Stat k="NEAR protocol" v={block.protocol ?? '…'} sub="ML-DSA host function since 87" />
          <Stat k="Deployed code" v={code.data ? code.data.hash.slice(0, 8) : '…'} sub={code.data ? (code.data.hash === UPGRADE_HASH ? <span className="o-sub-ok"><Icon name="check" size={12} /> matches the verified upgrade</span> : 'differs from the recorded upgrade') : code.error || 'Reading…'} />
        </div>
      </div>
      <img className="o-pq-hero-art" src={v3art('otzar-vault-lock')} alt="A jade vault with a gold dial and a lattice padlock" />
    </section>

    <section className="o-plain" aria-label="In plain words">
      <article><h3>The threat</h3><p>Bitcoin and most crypto use elliptic-curve keys. A big enough quantum computer could compute a private key from a public key. Any address that has ever spent shows its public key.</p></article>
      <article><h3>What Otzar does</h3><p>Your vault’s authority is a lattice-based ML-DSA key that quantum computers are not known to break. The NEAR contract refuses any spend, transfer, listing or rule change that is not signed by it.</p></article>
      <article><h3>How to check</h3><p>Every refusal below is a real NEAR testnet transaction. Open one: the contract’s own error says why it said no.</p></article>
    </section>

    <AttackerPanel />

    <div className="o-grid o-grid-even">
      <Card title="Refused on chain" className="o-card-flush">
        <ul className="o-proof">{LIVE_PROOF.map(([what, tx, why]) => <li key={tx}><a href={nearblocksTx(tx)} target="_blank" rel="noreferrer"><span className="o-feed-ico o-ico-bad"><Icon name="x" size={14} /></span><span><b>{what}</b><small className="mono">“{why}”</small></span><span className="o-link">{tx.slice(0, 6)}… <Icon name="external" size={11} /></span></a></li>)}</ul>
      </Card>
      <Card title="Who controls the contract" className="o-card-flush">
        <div className="o-pad">
          <p className="o-mute small">Read live with <code>view_access_key_list</code> on <a href={nearblocksAccount(contractId || '')} target="_blank" rel="noreferrer" className="mono">{contractId}</a>.</p>
          {keys.error && !keys.data ? <p className="o-err">{keys.error}</p> : !keys.data ? <p className="o-mute">Reading keys…</p>
            : <ul className="o-keys">{keys.data.map(k => { const pq = k.public_key.startsWith('ml-dsa'); const full = k.access_key.permission === 'FullAccess'; return <li key={k.public_key}>
              <span className={`o-keytype ${pq ? 'pq' : 'classic'}`}>{pq ? 'ML-DSA-65' : k.public_key.split(':')[0]}</span>
              <span className="mono small">{short(k.public_key, 18, 6)}</span>
              <span>{full ? 'Full access: can redeploy the contract' : 'Function-call key'}</span>
            </li>; })}</ul>}
          <p className="o-note"><Icon name="lock" size={14} /> This deploy key is still classical ed25519. Whoever holds it could upgrade the code that every vault trusts. Removing it would freeze upgrades and settlement config on this testnet build, so it stays, and we list it here instead of hiding it.</p>
        </div>
      </Card>
    </div>

    <Card title="Every protected action" className="o-card-flush">
      <div className="o-table o-table-protect" role="table">
        <div className="o-tr o-th" role="row"><span>Action</span><span>Contract method</span><span>What NEAR checks</span></div>
        {PROTECTED.map(([a, m, c]) => <div key={a} className="o-tr" role="row"><span><b>{a}</b></span><span className="mono small" data-label="Method">{m}</span><span data-label="Checks">{c}</span></div>)}
      </div>
    </Card>

    {wallet.account && <Card title="Your vaults" className="o-card-flush" action={<label className="o-btn o-btn-line o-btn-sm o-file"><input type="file" accept=".json,application/json" aria-label="Load ML-DSA key file" onChange={async e => { const f = e.target.files?.[0]; setErr(''); if (f) try { await loadKeyFile(f); } catch (x) { setErr((x as Error).message); } }} /><Icon name="key" size={14} /> Load a key file</label>}>
      {err && <p className="o-err o-pad">{err}</p>}
      {mine.length ? <div className="o-table o-table-keys">{mine.map(b => <VaultKeyRow key={b.token_id} b={b} />)}</div> : <p className="o-mute o-pad">You own no vaults yet.</p>}
    </Card>}
  </div>;
}
