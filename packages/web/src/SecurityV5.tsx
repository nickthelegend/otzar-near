import { useState } from 'react';
import { PROOF } from './blocks';
import { useNbtcVault } from './bridge';
import { useBoxes } from './data';
import { contractId, nearblocksTx, short } from './lib';
import { useCodeHash } from './live';
import { Icon } from './ui';
import { signAndSend, type Wallet } from './wallet';

type Attempt = { label: string; hash: string; refused: boolean; reason: string };
const PAST: [string, string, string][] = [
  ['NEAR key alone tries to move a locked vault', PROOF.transfer, 'ML-DSA signature required'],
  ['Forged quantum signature', PROOF.forgedTransfer, 'bad ML-DSA signature'],
  ['Spend signed with the wrong quantum key', PROOF.wrongKeySpend, 'bad ML-DSA signature'],
  ['Replay of a used signature', PROOF.nonceReplay, 'bad nonce'],
];

/** Quantum security in one picture, plus a live "try to break it" test that sends real attacks to NEAR testnet. */
export default function SecurityV5({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const code = useCodeHash(contractId);
  const want = new URLSearchParams(location.search).get('vault');
  const mine = (boxes.data || []).filter(b => b.owner_id === wallet.account && b.pq_key);
  const box = mine.find(b => b.token_id === want) || [...mine].reverse()[0];
  const v = useNbtcVault(box?.token_id);
  const [tries, setTries] = useState<Attempt[]>([]); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');

  async function attack(kind: 'classical' | 'forged') {
    setErr(''); setBusy(kind);
    try {
      if (!box || !contractId) throw new Error('Connect the vault owner first');
      const amount = String(Math.max(1, Number(v.data?.free_sats || 1)));
      // A forged signature: 3,309 random bytes, the size of a real ML-DSA-65 signature, made without the vault key.
      const forged = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(3309))));
      const args = kind === 'classical' ? { token_id: box.token_id, receiver_id: wallet.account, amount } : { token_id: box.token_id, receiver_id: wallet.account, amount, nonce: box.nonce, signature: forged };
      (window as { __OTZAR_ATTACK__?: string }).__OTZAR_ATTACK__ = kind;
      const r = await signAndSend(wallet.selector, contractId, 'withdraw_nbtc', args, '1', '150000000000000');
      const failure = r?.status?.Failure ? JSON.stringify(r.status.Failure) : '';
      const reason = failure.match(/panicked: ([^"\\]+)/)?.[1] || (failure ? 'refused' : 'accepted');
      setTries(t => [{ label: kind === 'classical' ? 'Withdraw with the NEAR key only' : 'Withdraw with a forged quantum signature', hash: r?.transaction?.hash || '', refused: !!failure, reason }, ...t]);
      v.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  return <div className="s5">
    <header className="c5-head"><h1>Quantum-safe</h1><p>Every move needs two signatures. One of them a quantum computer can’t forge.</p></header>
    <section className="c5-card s5-keys" aria-label="Two keys">
      <div className="s5-key s5-classic"><div className="s5-glyph" aria-hidden="true"><Icon name="key" size={30} /><i className="s5-crack" /></div><b>Your normal key</b><span>ed25519 / ECDSA</span><p>A future quantum computer could work it out from your public key.</p></div>
      <div className="s5-plus" aria-hidden="true">+</div>
      <div className="s5-key s5-pq"><div className="s5-glyph" aria-hidden="true"><Icon name="shield" size={30} /></div><b>Your quantum-safe key</b><span>ML-DSA-65 · NIST FIPS 204</span><p>Built on lattice math. No known quantum attack breaks it.</p></div>
      <div className="s5-eq" aria-hidden="true">=</div>
      <div className="s5-key s5-vault"><div className="s5-glyph" aria-hidden="true"><Icon name="lock" size={30} /></div><b>NEAR checks both</b><span>env::ml_dsa_verify</span><p>Inside the contract, before any coin moves.</p></div>
    </section>

    <div className="t5-grid">
      <section className="c5-card s5-test" aria-label="Try to break it">
        <div className="c5-tabs"><b>Try to break it</b>{box && <span className="c5-src">{box.token_id} · {Number(v.data?.balance_sats || 0).toLocaleString('en-US')} sats locked</span>}</div>
        <div className="s5-actions">
          <button className="o-btn o-btn-line o-btn-lg" onClick={() => attack('classical')} disabled={!!busy || !box}>{busy === 'classical' ? 'Sending…' : 'Withdraw with the NEAR key only'}</button>
          <button className="o-btn o-btn-ink o-btn-lg" onClick={() => attack('forged')} disabled={!!busy || !box}>{busy === 'forged' ? 'Sending…' : 'Withdraw with a forged quantum signature'}</button>
        </div>
        {!wallet.account && <p className="c5-empty">Connect the vault owner to run the test.</p>}
        {err && <p className="c5-err" role="alert">{err}</p>}
        {tries.map(t => <div key={t.hash || t.label} className={`s5-result ${t.refused ? 'refused' : 'accepted'}`}><Icon name={t.refused ? 'shield' : 'x'} size={18} /><div><b>{t.refused ? 'Refused on chain' : 'Accepted'}</b><span>{t.label} · “{t.reason}”</span></div>{t.hash && <a className="mono" href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer">{short(t.hash, 6, 4)} <Icon name="external" size={11} /></a>}</div>)}
      </section>
      <aside className="c5-card c5-ticket" aria-label="Contract">
        <h3 className="c5-ticket-h">Checked on NEAR</h3>
        <dl className="c5-dl">
          <div><dt>Contract</dt><dd className="mono">{short(contractId || '', 12, 8)}</dd></div>
          <div><dt>Code sha256</dt><dd className="mono">{code.data ? code.data.hash.slice(0, 12) : '…'}</dd></div>
          <div><dt>Signature size</dt><dd>3,309 bytes</dd></div>
          <div><dt>Public key</dt><dd>1,952 bytes</dd></div>
        </dl>
        <p className="s5-limit">Bitcoin’s own signatures and NEAR’s MPC keys are still classical. Otzar makes the vault’s authority quantum-safe.</p>
      </aside>
    </div>

    <section className="c5-card c5-table" aria-label="Refused before">
      <div className="c5-tabs"><b>Refused on NEAR testnet</b><span className="c5-count">{PAST.length}</span></div>
      <table><tbody>{PAST.map(([l, h, r]) => <tr key={h}><td>{l}</td><td><span className="c5-pill bad">{r}</span></td><td><a className="mono" href={nearblocksTx(h)} target="_blank" rel="noreferrer">{short(h, 8, 4)} <Icon name="external" size={11} /></a></td></tr>)}</tbody></table>
    </section>
  </div>;
}
