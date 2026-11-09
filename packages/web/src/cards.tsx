import { useState, type ReactNode } from 'react';
import { useBoxes, useNow, useTusdc } from './data';
import { ago, annualisedPct, btcFromSats, e6, earnedSummary, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, utcDay, ZERO_ETH, type Box, type ChainTx, type CoveredCall, type Phase, type Round } from './lib';
import { pct } from './rounds';
import { Amount, Icon, Link, State, type IconName } from './ui';
import type { Wallet } from './wallet';

export function StatCard({ label, icon, value, sub, highlight = false, children }: { label: string; icon?: IconName; value: ReactNode; sub?: ReactNode; highlight?: boolean; children?: ReactNode }) {
  return <div className={`stat ${highlight ? 'stat-hi' : ''}`}>
    <div className="stat-top"><span>{label}</span>{icon && <i className="stat-ic"><Icon name={icon} size={15} /></i>}</div>
    <div className="stat-v">{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
    {children}
  </div>;
}

export const PHASE_TONE: Record<Phase, string> = { live: 'gold', sold: 'ice', itm: 'ice', otm: 'muted', unfilled: 'dim', other: 'dim' };
export function PhasePill({ c, now }: { c: CoveredCall; now: number }) {
  const ph = roundPhase(c, now);
  return <span className={`pp pp-${PHASE_TONE[ph.phase]}`}><i />{ph.label}</span>;
}

/** Annualised yield per round, oldest first; the chosen round is highlighted and labelled. */
export function RoundBars({ rounds, selected, onPick, height = 168 }: { rounds: CoveredCall[]; selected?: string; onPick?: (key: string) => void; height?: number }) {
  const list = [...rounds].sort((a, b) => a.opened_ns - b.opened_ns);
  const vals = list.map(r => annualisedPct(r));
  const top = Math.max(20, ...vals.map(v => v ?? 0));
  const key = (r: CoveredCall) => `${r.token_id}#${r.id}`;
  const sel = selected || key([...list].reverse().find(r => r.premium_paid_usdc) || list[list.length - 1]);
  const ticks = [top, top / 2, 0];
  return <div className="rb">
    <div className="rb-axis" style={{ height }}>{ticks.map(t => <span key={t}>{t.toFixed(0)}%</span>)}</div>
    <div className="rb-plot" style={{ height }}>
      {ticks.map(t => <i key={t} className="rb-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
      {list.map((r, i) => { const v = vals[i]; const on = key(r) === sel; return <button key={key(r)} className={`rb-bar ${on ? 'on' : ''} ${v === null ? 'none' : ''} ${i >= list.length - 1 && list.length > 1 ? 'tip-r' : i === 0 && list.length > 1 ? 'tip-l' : ''}`} onClick={() => onPick?.(key(r))} aria-label={`Round ${r.id} on ${r.token_id}: ${v === null ? 'no premium paid' : `${v.toFixed(1)}% annualised`}`}>
        {on && v !== null && <span className="rb-tip"><small>{short(r.token_id, 9, 4)} · {utcDay(r.opened_ns)}</small><b>{v.toFixed(2)}%</b></span>}
        <span className="rb-col" style={{ height: `${v === null ? 2 : Math.max(4, (v / top) * 100)}%` }} />
      </button>; })}
    </div>
    <div className="rb-x">{list.map(r => <span key={key(r)}>{r.token_id.replace(/^call-/, '').slice(0, 7)}</span>)}</div>
  </div>;
}

export type VaultFilter = 'all' | 'rounds' | 'mine';
/** The vault list (Ribbon's product catalog as a table): realised APY, latest round, collateral, owner. */
export function VaultTable({ boxes, rounds, account, filter }: { boxes: Box[]; rounds: Round[] | null; account: string; filter: VaultFilter }) {
  const now = useNow(15000);
  const latest = (id: string) => rounds?.find(r => r.token_id === id);
  const list = boxes.filter(b => filter === 'all' || (filter === 'mine' ? b.owner_id === account : !!latest(b.token_id)))
    .sort((a, b) => (annualisedPct(latest(b.token_id) || ({} as CoveredCall)) ?? -1) - (annualisedPct(latest(a.token_id) || ({} as CoveredCall)) ?? -1) || Number(!!latest(b.token_id)) - Number(!!latest(a.token_id)));
  if (!list.length) return <State kind="empty" title={filter === 'mine' ? (account ? 'You own no vaults yet' : 'Connect to see your vaults') : 'No vaults here'}>Each vault is an NFT on NEAR that owns a native Bitcoin address through Chain Signatures.</State>;
  return <div className="vt" role="table" aria-label="Vaults">
    <div className="vt-head" role="row"><span role="columnheader">Vault</span><span role="columnheader">Realised APY</span><span role="columnheader">Latest round</span><span role="columnheader">Collateral</span><span role="columnheader">Security</span><span /></div>
    {list.map(b => {
      const r = latest(b.token_id); const apy = r ? annualisedPct(r) : null; const sealed = !!b.pq_key?.length;
      const all = rounds?.filter(x => x.token_id === b.token_id) || [];
      return <Link key={b.token_id} to={`/vault/${b.token_id}`} className={`vt-row ${b.owner_id === account ? 'mine' : ''}`}>
        <span className="vt-vault" role="cell"><span className="vt-glyph" aria-hidden="true">箱</span><span><b>{b.token_id}</b><small>{b.owner_id === account ? 'Your vault' : short(b.owner_id, 14, 8)} · BTC covered call</small></span></span>
        <span className="vt-apy" role="cell" data-label="Realised APY">{apy === null ? <em>{r ? 'no premium' : '—'}</em> : <b>{apy.toFixed(1)}%</b>}</span>
        <span role="cell" data-label="Latest round">{r ? <PhasePill c={r} now={now} /> : <span className="dim">No rounds yet</span>}{all.length > 1 && <small className="dim"> · {all.length} rounds</small>}</span>
        <span className="vt-num" role="cell" data-label="Collateral">{r ? <>{btcFromSats(r.collateral_sats)} <small>BTC</small></> : <span className="dim">—</span>}</span>
        <span className="vt-sec" role="cell" data-label="Security"><i className={sealed ? 'on' : ''} title="ML-DSA key" /><i className={b.policy.recovery_eth !== ZERO_ETH ? 'on' : ''} title="Spending rules" /><i className={b.policy.guardian ? 'on' : ''} title="Guardian" />{sealed ? 'ML-DSA' : 'No key'}</span>
        <span className="vt-go" aria-hidden="true">Open <Icon name="arrow" size={14} /></span>
      </Link>;
    })}
  </div>;
}

/** Your position: live tUSDC balance, vaults you own and premium your rounds earned. */
export function PositionCard({ wallet, rounds }: { wallet: Wallet; rounds: Round[] | null }) {
  const bal = useTusdc(wallet.account); const boxes = useBoxes();
  const mine = rounds?.filter(r => r.writer === wallet.account) || [];
  const s = earnedSummary(mine);
  const owned = boxes.data?.filter(b => b.owner_id === wallet.account).length;
  return <section className="card pos" aria-label="Your position">
    <div className="card-title"><h2>Your position</h2>{wallet.account && <Link to="/you" className="mini-link">Portfolio <Icon name="arrow" size={13} /></Link>}</div>
    {wallet.account ? <>
      <p className="pos-acct mono">{short(wallet.account, 16, 10)}</p>
      <p className="pos-v">{bal.data !== null ? <Amount e6={bal.data} unit={TUSDC_SYMBOL} /> : bal.error ? <span className="dim" title={bal.error}>Unavailable</span> : <span className="dim">Loading…</span>}</p>
      <dl className="pos-kv">
        <div><dt>Vaults you own</dt><dd>{owned ?? '…'}</dd></div>
        <div><dt>Rounds you wrote</dt><dd>{rounds ? mine.length : '…'}</dd></div>
        <div><dt>Premium earned</dt><dd>{rounds ? <Amount e6={s.earned} /> : '…'}</dd></div>
      </dl>
    </> : <div className="pos-empty">
      <p>Connect a NEAR testnet wallet to see your vaults, the rounds you wrote and your {TUSDC_SYMBOL} balance.</p>
      <button className="pill pill-ice pill-block" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect wallet</button>
    </div>}
  </section>;
}

const ACTION: Record<string, string> = {
  write_call: 'Round written', ft_on_transfer: 'Premium paid', on_call_payment: 'Premium settled', settle_call: 'Round settled', exercise_btc: 'Call exercised', on_call_signed: 'MPC signed', close_unfilled_call: 'Unfilled round closed', lapse_call: 'Round lapsed', expire_unsettled_call: 'Unsettled round released',
  post_relayer_price: 'Price posted', set_call_config: 'Strategy configured', mint: 'Vault minted', register_pq_key: 'Quantum key set', set_policy: 'Rules set', register_btc: 'BTC address registered',
  request_btc_spend: 'BTC spend requested', execute_btc: 'BTC spend signed', on_btc_signed: 'BTC signature returned', guardian_clawback_btc: 'Guardian clawback', set_guardians: 'Guardians set', initiate_pq_recovery: 'Key recovery started', finalize_pq_recovery: 'Key recovered', set_inheritance: 'Heir set', check_in: 'Owner check-in',
  buy: 'Vault bought', list: 'Vault listed', unlist: 'Listing removed', request_eth_spend: 'ETH spend requested', execute_eth: 'ETH spend signed', request_sol_spend: 'SOL spend requested', execute_sol: 'SOL spend signed',
};
export const actionLabel = (m: string) => ACTION[m] || m.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** Contract activity read from NearBlocks v3 (testnet), newest first. */
export function ActivityTable({ txns, error, loading, limit = 10 }: { txns: ChainTx[] | null; error: string; loading: boolean; limit?: number }) {
  const now = useNow(15000);
  const [n, setN] = useState(limit);
  if (error && !txns) return <State kind="error" title="Activity unavailable">{error}</State>;
  if (loading || !txns) return <div className="at at-skel" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="at-row skeleton" />)}</div>;
  if (!txns.length) return <State kind="empty" title="No contract activity yet" />;
  return <div className="at" role="table" aria-label="Contract activity">
    <div className="at-head" role="row"><span>Action</span><span>Account</span><span>Status</span><span>Time</span><span>Transaction</span></div>
    {txns.slice(0, n).map(t => <a key={t.hash} className="at-row" href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer" role="row">
      <span className="at-act"><b>{actionLabel(t.method)}</b><code>{t.method}</code></span>
      <span className="at-acct mono">{short(t.signer, 14, 8)}</span>
      <span><span className={`pp ${t.ok ? 'pp-ice' : 'pp-bad'}`}><i />{t.ok ? 'Success' : 'Failed'}</span></span>
      <span className="at-time">{ago(t.ns, now)}</span>
      <span className="at-tx mono">{short(t.hash, 6, 4)} <Icon name="external" size={12} /></span>
    </a>)}
    {txns.length > n && <button className="at-more" onClick={() => setN(txns.length)}>Show {txns.length - n} more</button>}
  </div>;
}

/** Ribbon's strategy snapshot: where the strike sits against the settlement or live relayer price. */
export function StrikeSpot({ c, spotE6, spotLabel }: { c: CoveredCall; spotE6: string | null; spotLabel: string }) {
  const strike = Number(c.strike_usd_e6) / 1e6; const spot = spotE6 ? Number(spotE6) / 1e6 : null;
  const lo = Math.min(strike, spot ?? strike) * 0.97, hi = Math.max(strike, spot ?? strike) * 1.03;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return <div className="ss" role="img" aria-label={`Strike $${strike.toLocaleString()}${spot ? `, ${spotLabel} $${spot.toLocaleString()}` : ''}`}>
    <div className="ss-track">
      <span className="ss-zone" style={{ left: at(strike) }} />
      <span className="ss-mark ss-strike" style={{ left: at(strike) }}><b>Strike</b><em>${e6(c.strike_usd_e6, 0)}</em></span>
      {spot !== null && <span className="ss-mark ss-spot" style={{ left: at(spot) }}><b>{spotLabel}</b><em>${spot.toLocaleString('en-US', { maximumFractionDigits: 0 })}</em></span>}
    </div>
    <div className="ss-legend"><span><i className="ss-k1" />Writer keeps the sats</span><span><i className="ss-k2" />Buyer can exercise (upside given up)</span></div>
  </div>;
}

export { nearblocksAccount, pct };
