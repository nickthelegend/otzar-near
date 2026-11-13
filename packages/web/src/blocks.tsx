import { useEffect, useRef, useState, type ReactNode } from 'react';
import { actionLabel } from './cards';
import { useNow } from './data';
import { ago, btcFromSats, e6, earnedSummary, isDemoRound, isPublicVault, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, type Box, type ChainTx, type Round } from './lib';
import { Icon, Link, State } from './ui';

export const v3art = (name: string) => `/art/v3/${name}.webp`;

/** Status pill for a round, in plain words. */
export function RoundPill({ r, now }: { r: Round; now: number }) {
  const ph = roundPhase(r, now);
  const text: Record<string, string> = { live: 'Open to buyers', sold: 'Sold · running', itm: 'Exercised', otm: 'Expired · BTC kept', unfilled: 'No buyer', other: ph.label };
  return <span className={`o-pill o-pill-${ph.phase}`}><i aria-hidden="true" />{ph.phase === 'sold' && r.expiry_ns / 1e6 < now ? 'Sold · settling' : text[ph.phase]}</span>;
}

export function LockBadge({ box }: { box: Box }) {
  return box.pq_key
    ? <span className="o-lock o-lock-on" title="Spends, transfer and listing need this vault's ML-DSA-65 signature"><Icon name="shield" size={14} />ML-DSA</span>
    : <span className="o-lock" title="No post-quantum key yet: only the owner's NEAR key protects it"><Icon name="lock" size={14} />Not locked</span>;
}

/** Aevo-style strategy table: one row per vault, sorted with open auctions first. */
export function VaultRows({ boxes, rounds, account = '', filter = 'public', limit, asks }: { boxes: Box[]; rounds: Round[] | null; account?: string; filter?: 'public' | 'mine' | 'earning'; limit?: number; asks?: Record<string, string | null> | null }) {
  const now = useNow(5000);
  const byVault = (id: string) => (rounds || []).filter(r => r.token_id === id);
  const list = boxes.filter(b => filter === 'mine' ? b.owner_id === account : isPublicVault(b.token_id) && (filter !== 'earning' || byVault(b.token_id).length > 0))
    .map(b => ({ b, rs: byVault(b.token_id) }))
    .sort((x, y) => {
      const lx = x.rs[0] && roundPhase(x.rs[0], now).phase === 'live' ? 1 : 0, ly = y.rs[0] && roundPhase(y.rs[0], now).phase === 'live' ? 1 : 0;
      return ly - lx || (y.rs[0]?.opened_ns || 0) - (x.rs[0]?.opened_ns || 0);
    });
  if (!list.length) return <State kind="empty" title={filter === 'mine' ? (account ? 'You own no vaults yet' : 'Connect to see your vaults') : 'No vaults yet'}>Each vault is an NFT on NEAR that controls its own Bitcoin address.</State>;
  return <div className="o-table" role="table" aria-label="Vaults">
    <div className="o-tr o-th" role="row"><span role="columnheader">Vault</span><span role="columnheader">Strike</span><span role="columnheader">Size</span><span role="columnheader">Status</span><span role="columnheader">Lock</span><span role="columnheader" className="o-num">Premium earned</span></div>
    {list.slice(0, limit ?? list.length).map(({ b, rs }) => {
      const r = rs[0]; const earned = earnedSummary(rs).earned; const ask = asks?.[b.token_id];
      return <Link key={b.token_id} to={`/vault/${encodeURIComponent(b.token_id)}`} className={`o-tr ${b.owner_id === account ? 'o-tr-mine' : ''}`}>
        <span className="o-vault" role="cell"><img src={v3art('otzar-icon-128')} alt="" width="36" height="36" /><span><b>{b.token_id}</b><small>{r ? `BTC covered call · ${rs.length} ${rs.length === 1 ? 'round' : 'rounds'}` : 'Quantum-safe vault'}{b.owner_id === account ? ' · yours' : ''}</small></span></span>
        <span role="cell" data-label="Strike" className="tnum">{r ? `$${e6(r.strike_usd_e6, 0)}` : <span className="dim">—</span>}</span>
        <span role="cell" data-label="Size" className="tnum">{r ? `${btcFromSats(r.size_sats)} BTC` : <span className="dim">—</span>}</span>
        <span role="cell" data-label="Status">{r ? <>{<RoundPill r={r} now={now} />}{ask && <small className="o-ask tnum">ask {e6(ask, 4)} {TUSDC_SYMBOL}</small>}</> : <span className="dim">No rounds yet</span>}</span>
        <span role="cell" data-label="Lock"><LockBadge box={b} /></span>
        <span role="cell" data-label="Premium" className="o-num tnum">{earned > 0n ? <b>{e6(earned.toString(), 4)} <small>{TUSDC_SYMBOL}</small></b> : <span className="dim">{r && isDemoRound(r) && !r.premium_paid_usdc ? 'Unsold' : '—'}</span>}</span>
      </Link>;
    })}
  </div>;
}

const KIND: Record<string, { icon: 'shield' | 'coin' | 'key' | 'send' | 'tag' | 'plus' | 'clock' | 'check' | 'box'; tone: string }> = {
  write_call: { icon: 'plus', tone: 'gold' }, ft_on_transfer: { icon: 'coin', tone: 'gold' }, on_call_payment: { icon: 'coin', tone: 'gold' }, settle_call: { icon: 'check', tone: 'jade' },
  register_pq_key: { icon: 'shield', tone: 'jade' }, set_guardians: { icon: 'shield', tone: 'jade' }, initiate_pq_recovery: { icon: 'key', tone: 'jade' }, finalize_pq_recovery: { icon: 'key', tone: 'jade' },
  mint: { icon: 'box', tone: 'ink' }, register_btc: { icon: 'key', tone: 'ink' }, post_relayer_price: { icon: 'clock', tone: 'ink' }, request_btc_spend: { icon: 'send', tone: 'ink' }, execute_btc: { icon: 'send', tone: 'ink' },
  list: { icon: 'tag', tone: 'ink' }, unlist: { icon: 'tag', tone: 'ink' }, nft_transfer: { icon: 'send', tone: 'ink' },
};
const FEED_LABEL: Record<string, string> = { nft_transfer: 'Vault transfer', deploy_contract: 'Contract upgraded', 'deploy contract': 'Contract upgraded' };

/** The live on-chain feed: newest contract transactions from NearBlocks. Rejected calls are shown as the
 * contract refusing them, which is usually a security check doing its job. */
export function Feed({ txns, error, loading, limit = 8, dense = false, filter }: { txns: ChainTx[] | null; error: string; loading: boolean; limit?: number; dense?: boolean; filter?: (t: ChainTx) => boolean }) {
  const now = useNow(1000);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!txns) return;
    if (seen.current) { const n = txns.filter(t => !seen.current!.has(t.hash)).map(t => t.hash); if (n.length) { setFresh(new Set(n)); setTimeout(() => setFresh(new Set()), 2400); } }
    seen.current = new Set(txns.map(t => t.hash));
  }, [txns]);
  if (error && !txns) return <State kind="error" title="Activity unavailable">{error}</State>;
  if (loading || !txns) return <ul className="o-feed" aria-busy="true">{Array.from({ length: Math.min(limit, 5) }, (_, i) => <li key={i} className="o-feed-row skeleton" />)}</ul>;
  const list = (filter ? txns.filter(filter) : txns).slice(0, limit);
  if (!list.length) return <State kind="empty" title="Nothing here yet">New contract transactions appear here within seconds.</State>;
  return <ul className={`o-feed ${dense ? 'o-feed-dense' : ''}`} aria-live="polite">
    {list.map(t => {
      const k = KIND[t.method] || { icon: 'box' as const, tone: 'ink' };
      return <li key={t.hash} className={`o-feed-row ${fresh.has(t.hash) ? 'o-feed-new' : ''}`}>
        <a href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer">
          <span className={`o-feed-ico o-ico-${t.ok ? k.tone : 'bad'}`}><Icon name={t.ok ? k.icon : 'x'} size={15} /></span>
          <span className="o-feed-main"><b>{FEED_LABEL[t.method] || actionLabel(t.method)}</b><small>{short(t.signer, 12, 8)} · <span className="mono">{t.hash.slice(0, 6)}…</span></small></span>
          <span className="o-feed-side">{t.ok ? <span className="o-ok">Confirmed</span> : <span className="o-rej">Rejected on chain</span>}<small className="tnum">{ago(t.ns, now)}</small></span>
        </a>
      </li>;
    })}
  </ul>;
}

/** "What a quantum attacker can't do": the guarantee, with the on-chain proof for each row and the honest limits. */
export const PROOF = {
  transfer: '3PghCRJxtpsUXpwsnXmeC64qwqPRFXpAALUApmLwjNpZ', forgedTransfer: 'CzDzjh2x4YgKkHTjML4oX63k59getTWdcQT3SgmQ8sSy', list: 'ATu4EK8AG6FSJKVEHjTUTQLPkGVBQ9HnnCiEY3Litzk',
  signedList: 'FnCLpz6RzsQDRokCdNUaETqtWHa1w5MBDJ9HJkTAffLk', upgrade: 'DYNM8tkz6ss7NvxrsZhX61a8EGu3iA4qRYagA43Mn4ua',
  guardianRejected: 'C26pPNCi4RfYH9x2ZTMnzuyNKCHv1XNeo67pz29RHDzn', earlyFinalize: '5zrAxsiFqBehWMpJFZUbd61FDzZzxg5Fx87ckxFT4zAp', recovered: 'GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc',
  spendWhileSold: 'A2FQof1ircJejob64sUrRHejyyhAPszGg4S4VDzcMTMN', wrongKeySpend: '9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi', nonceReplay: '9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt', mlDsaWrite: '2fUWxgkMiXCakivEEjjgXa13HfamxavMR7RAfESGYZAK',
};
const CANT: { title: string; body: string; tx?: string; txLabel?: string }[] = [
  { title: 'Move your coins', body: 'Every spend request carries an ML-DSA-65 signature that NEAR checks before it asks the MPC network to sign the Bitcoin transaction.', tx: PROOF.wrongKeySpend, txLabel: 'Wrong-key spend refused' },
  { title: 'Take or sell the vault', body: 'Transferring or listing a locked vault needs the same post-quantum signature. Breaking the owner’s NEAR key is not enough.', tx: PROOF.transfer, txLabel: 'Classical-key transfer refused' },
  { title: 'Forge your signature', body: 'A signature from any other ML-DSA key fails the check in the contract, so a made-up key gets nowhere.', tx: PROOF.forgedTransfer, txLabel: 'Forged ML-DSA refused' },
  { title: 'Rewrite your rules', body: 'Daily caps, delays, guardians, heirs and every covered call you write are signed with your ML-DSA key too.', tx: PROOF.mlDsaWrite, txLabel: 'An ML-DSA-signed call' },
  { title: 'Push through a recovery', body: 'Key recovery needs two of three post-quantum guardians and a time lock you can cancel.', tx: PROOF.guardianRejected, txLabel: 'One guardian refused' },
];
const STILL: { title: string; body: string }[] = [
  { title: 'Bitcoin’s own signature', body: 'Once a withdrawal is signed and broadcast, Bitcoin itself checks a classical ECDSA signature. Bitcoin runs on regtest in this demo.' },
  { title: 'NEAR’s MPC network', body: 'Chain Signatures’ root key is classical today. NEAR has said post-quantum threshold signing is at least a year away.' },
  { title: 'The contract account key', body: 'The deploy key for the Otzar contract is still ed25519, so whoever holds it could upgrade the code. Locking it would freeze upgrades on this testnet build.' },
];
export function AttackerPanel({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return <div className={`o-attack ${dark ? 'o-attack-dark' : ''} ${compact ? 'o-attack-compact' : ''}`}>
    <div className="o-attack-col">
      <h3>What a quantum attacker can’t do</h3>
      <ul>{CANT.map(c => <li key={c.title}><span className="o-attack-x" aria-hidden="true"><Icon name="x" size={14} /></span><div><b>{c.title}</b>{!compact && <p>{c.body}</p>}{c.tx && <a href={nearblocksTx(c.tx)} target="_blank" rel="noreferrer">{c.txLabel} <Icon name="external" size={11} /></a>}</div></li>)}</ul>
    </div>
    <div className="o-attack-col o-attack-still">
      <h3>Still classical, said plainly</h3>
      <ul>{STILL.map(c => <li key={c.title}><span className="o-attack-dot" aria-hidden="true" /><div><b>{c.title}</b>{!compact && <p>{c.body}</p>}</div></li>)}</ul>
    </div>
  </div>;
}

export function Stat({ k, v, sub, live }: { k: ReactNode; v: ReactNode; sub?: ReactNode; live?: boolean }) {
  return <div className="o-stat"><p className="o-stat-k">{live && <i className="o-live" aria-hidden="true" />}{k}</p><p className="o-stat-v tnum">{v}</p>{sub && <p className="o-stat-sub">{sub}</p>}</div>;
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`o-card ${className}`}>{(title || action) && <header className="o-card-h">{title && <h2>{title}</h2>}{action}</header>}{children}</section>;
}
