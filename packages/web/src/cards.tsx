import { useLayoutEffect, useRef, useState } from 'react';
import { useNow } from './data';
import { ago, annualisedPct, btcFromSats, demoRoundLabel, e6, isDemoRound, isPublicVault, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, utcDay, type Box, type ChainTx, type CoveredCall, type Phase, type Round } from './lib';
import { pct } from './rounds';
import { Icon, Link, State, Term, TERMS } from './ui';

export type VaultType = 'call' | 'qsafe' | 'any';
/** The vault's product type, shown by colour: covered call (has rounds), any-chain (holds a Solana address), quantum-safe custody. */
export const vaultType = (id: string, hasRounds: boolean): VaultType => (hasRounds ? 'call' : id.startsWith('sol-') ? 'any' : 'qsafe');
export const TYPE_LABEL: Record<VaultType, string> = { call: 'BTC covered call', qsafe: 'Quantum-safe vault', any: 'Any-chain vault' };
export const PHASE_TONE: Record<Phase, string> = { live: 'gold', sold: 'jade', itm: 'jade', otm: 'blush', unfilled: 'dim', other: 'dim' };
/** What happened in a round, in words a first-time visitor reads without a glossary. */
export const PLAIN: Record<Phase, string> = { live: 'Open for a buyer', sold: 'Sold, running', itm: 'BTC transfer signed', otm: 'Expired, BTC kept', unfilled: 'No buyer', other: 'In progress' };
export function plainRoundLabel(c: CoveredCall, now: number) {
  const ph = roundPhase(c, now);
  return ph.phase === 'other' || (ph.phase === 'itm' && c.state !== 'signed') || c.state === 'purchasing' || (ph.phase === 'sold' && c.expiry_ns / 1e6 <= now) ? ph.label : PLAIN[ph.phase];
}
export function PhasePill({ c, now, plain = false }: { c: CoveredCall; now: number; plain?: boolean }) {
  const ph = roundPhase(c, now);
  return <span className={`pp pp-${PHASE_TONE[ph.phase]}`} title={plain ? ph.label : undefined}><i />{plain ? plainRoundLabel(c, now) : ph.label}</span>;
}

/** Token amounts the way a wallet shows them: four decimals at most, two at least. */
export const money = (v: string | bigint) => (Number(v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** One round as a sentence: who paid what for which right, and how it ended. */
export function roundSentence(c: CoveredCall, now: number): string {
  const ph = roundPhase(c, now);
  const usd = (v: string) => `$${Math.round(Number(v) / 1e6).toLocaleString('en-US')}`;
  const size = `${btcFromSats(c.size_sats)} BTC`, strike = usd(c.strike_usd_e6);
  const paid = c.premium_paid_usdc ? `${money(c.premium_paid_usdc)} ${TUSDC_SYMBOL}` : '';
  const settled = c.oracle_price_usd_e6 ? usd(c.oracle_price_usd_e6) : '';
  switch (ph.phase) {
    case 'itm': return `A buyer paid ${paid} for the right to buy ${size} at ${strike}. BTC settled at ${settled}, above that price. ${c.state === 'signed' ? 'The strike was paid and NEAR signed the BTC transfer; this state does not prove Bitcoin delivery.' : c.state === 'paid' || c.state === 'signing' ? 'The strike was paid; the Bitcoin signature is still pending.' : 'The buyer must finish paying the strike and requesting the BTC signature.'} The vault kept the premium.`;
    case 'otm': return `A buyer paid ${paid} for the right to buy ${size} at ${strike}. BTC settled at ${settled}, below that price, so the vault kept its BTC and the premium.`;
    case 'sold': return `A buyer paid ${paid} for the right to buy ${size} at ${strike}. ${c.expiry_ns / 1e6 <= now ? 'The round has ended and is awaiting the signed settlement price' : 'The round is running'}; the premium is the vault's either way.`;
    case 'live': return `The vault is offering ${size} at ${strike}. The asking premium falls until a buyer pays it.`;
    case 'unfilled': return `The vault offered ${size} at ${strike}, but no buyer paid the premium before the auction ended. Nothing was sold.`;
    default: return `${ph.label}: ${size} at ${strike}.`;
  }
}

/** Actual premiums when demo rounds are present; day-long rounds may show annualised yield. */
export function RoundBars({ rounds, selected, onPick, height = 168 }: { rounds: CoveredCall[]; selected?: string; onPick?: (key: string) => void; height?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [tipEdge, setTipEdge] = useState<'left' | 'right' | ''>('');
  const list = [...rounds].sort((a, b) => a.opened_ns - b.opened_ns);
  const premiums = list.some(isDemoRound);
  const vals = list.map(r => premiums ? r.premium_paid_usdc ? Number(r.premium_paid_usdc) / 1e6 : null : annualisedPct(r));
  const top = Math.max(premiums ? 0.000001 : 20, ...vals.map(v => v ?? 0));
  const key = (r: CoveredCall) => `${r.token_id}#${r.id}`;
  const sel = selected || (list.length ? key([...list].reverse().find(r => r.premium_paid_usdc) || list[list.length - 1]) : '');
  useLayoutEffect(() => {
    const tip = root.current?.querySelector<HTMLElement>('.rb-tip');
    if (!tip) { setTipEdge(''); return; }
    const measure = () => {
      const bar = tip.parentElement!.getBoundingClientRect();
      const plot = tip.parentElement!.parentElement!.getBoundingClientRect();
      const center = bar.left + bar.width / 2, half = tip.offsetWidth / 2;
      setTipEdge(center + half > plot.right ? 'right' : center - half < plot.left ? 'left' : '');
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current!); observer.observe(tip);
    return () => observer.disconnect();
  }, [rounds, sel]);
  const ticks = [top, top / 2, 0];
  return <div className="rb" ref={root} role="group" aria-label={premiums ? `Premium paid in ${TUSDC_SYMBOL}; short terms are demo rounds` : 'Annualised yield per round'}>
    <div className="rb-axis" style={{ height }}>{ticks.map(t => <span key={t}>{premiums ? t.toLocaleString('en-US', { maximumFractionDigits: 6 }) : `${t.toFixed(0)}%`}</span>)}</div>
    <div className="rb-plot" style={{ height }}>
      {ticks.map(t => <i key={t} className="rb-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
      {list.map((r, i) => { const v = vals[i]; const on = key(r) === sel; return <button key={key(r)} className={`rb-bar ${on ? 'on' : ''} ${v === null ? 'none' : ''} ${(on && tipEdge === 'right') || (i >= list.length - 1 && list.length > 1) ? 'tip-r' : (on && tipEdge === 'left') || (i === 0 && list.length > 1) ? 'tip-l' : ''}`} onClick={() => onPick?.(key(r))} aria-label={`Round ${r.id} on ${r.token_id}: ${isDemoRound(r) ? `${demoRoundLabel(r)}; ` : ''}${v === null ? 'no premium paid' : premiums ? `${money(r.premium_paid_usdc!)} ${TUSDC_SYMBOL} paid` : `${v.toFixed(1)}% annualised`}`}>
        {on && v !== null && <span className="rb-tip"><small>{short(r.token_id, 9, 4)} · {utcDay(r.opened_ns)}</small><b>{premiums ? `${money(r.premium_paid_usdc!)} ${TUSDC_SYMBOL}` : `${v.toFixed(2)}%`}</b>{isDemoRound(r) && <small>{demoRoundLabel(r)}</small>}</span>}
        <span className="rb-col" style={{ height: `${v === null ? 2 : Math.max(4, (v / top) * 100)}%` }} />
      </button>; })}
    </div>
    <div className="rb-x">{list.map(r => <span key={key(r)}>{r.token_id.replace(/^call-/, '').slice(0, 7)}</span>)}</div>
  </div>;
}

export type VaultFilter = 'all' | 'rounds' | 'mine';
/** The vault list (Ribbon's product catalog as a table): realised APY, latest round, collateral, owner. */
export function VaultTable({ boxes, rounds, account, filter, limit }: { boxes: Box[]; rounds: Round[] | null; account: string; filter: VaultFilter; limit?: number }) {
  const now = useNow(15000);
  const latest = (id: string) => rounds?.find(r => r.token_id === id);
  const list = boxes.filter(b => (filter === 'mine' || isPublicVault(b.token_id)) && (filter === 'all' || (filter === 'mine' ? b.owner_id === account : !!latest(b.token_id))))
    .sort((a, b) => (annualisedPct(latest(b.token_id) || ({} as CoveredCall)) ?? -1) - (annualisedPct(latest(a.token_id) || ({} as CoveredCall)) ?? -1) || Number(!!latest(b.token_id)) - Number(!!latest(a.token_id)));
  if (!list.length) return <State kind="empty" title={filter === 'mine' ? (account ? 'You own no vaults yet' : 'Connect to see your vaults') : 'No vaults here'}>Each vault is an NFT on NEAR that owns a native Bitcoin address through Chain Signatures.</State>;
  return <div className="vt vt-simple" role="table" aria-label="Vaults">
    <div className="vt-head" role="row"><span role="columnheader">Vault</span><span role="columnheader"><Term tip={TERMS.apy}>Earned</Term></span><span role="columnheader">Last round</span><span /></div>
    {list.slice(0, limit ?? list.length).map(b => {
      const r = latest(b.token_id); const apy = r ? annualisedPct(r) : null;
      const all = rounds?.filter(x => x.token_id === b.token_id) || [];
      const t = vaultType(b.token_id, all.length > 0);
      return <Link key={b.token_id} to={`/vault/${b.token_id}`} className={`vt-row vt-${t} ${b.owner_id === account ? 'mine' : ''}`}>
        <span className="vt-vault" role="cell"><span className="vt-glyph" aria-hidden="true">א</span><span><b>{b.token_id}</b><small>{TYPE_LABEL[t]}{b.owner_id === account ? ' · yours' : ''}{all.length > 1 ? ` · ${all.length} rounds` : ''}</small></span></span>
        <span className="vt-apy" role="cell" data-label="Earned">{r && isDemoRound(r) ? <em>{demoRoundLabel(r)}</em> : apy === null ? <em>{r ? 'nothing yet' : '—'}</em> : <><b>{apy.toFixed(1)}%</b><small>APY</small></>}</span>
        <span role="cell" data-label="Last round">{r ? <PhasePill c={r} now={now} plain /> : <span className="dim">No rounds yet</span>}</span>
        <span className="vt-go" aria-hidden="true"><Icon name="arrow" size={16} /></span>
      </Link>;
    })}
  </div>;
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
    <div className="at-head" role="row"><span>Action</span><span>Account</span><span>Status</span><span>Time</span><span /></div>
    {txns.slice(0, n).map(t => <a key={t.hash} className="at-row" href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer" role="row">
      <span className="at-act" title={t.method}><b>{actionLabel(t.method)}</b></span>
      <span className="at-acct mono">{short(t.signer, 14, 8)}</span>
      <span><span className={`pp ${t.ok ? 'pp-jade' : 'pp-bad'}`}><i />{t.ok ? 'Success' : 'Failed'}</span></span>
      <span className="at-time">{ago(t.ns, now)}</span>
      <span className="at-tx">View <Icon name="external" size={12} /></span>
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
