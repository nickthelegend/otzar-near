import type { ReactNode } from 'react';
import evidence from './evidence/live-calls.json';
import { annualisedPct, aprFor, btcFromSats, callTenorSec, e6, nearblocksTx, roundPhase, short, tenorLabel, TUSDC_SYMBOL, utcDay, utcTime, type CoveredCall, type Round } from './lib';
import { Amount, Icon, Link } from './ui';

export type EvidenceRow = (typeof evidence.calls)[number];
/** Transaction hashes recorded by scripts/demo-calls.sh for a round, when it was one of the recorded runs. */
export const evidenceFor = (c: CoveredCall): EvidenceRow | undefined => evidence.calls.find(r => r.tokenId === c.token_id);
export const evidenceMeta = { premiumToken: evidence.premiumToken, priceTx: evidence.price, date: evidence.date };

export const pct = (v: number | null, d = 1) => (v === null ? '—' : `${v.toFixed(d)}%`);

/** Auction band (floor → opening premium, as APR) with the premium actually paid marked on it. */
export function AprRange({ c, compact = false }: { c: CoveredCall; compact?: boolean }) {
  const floor = aprFor(c, c.minimum_premium_usdc), open = aprFor(c, c.opening_premium_usdc), paid = annualisedPct(c);
  if (floor === null || open === null) return null;
  if (paid === null && roundPhase(c, Date.now()).phase !== 'live') return <p className="apr-none">Auction closed with no buyer · asked {e6(c.opening_premium_usdc, 2)} → {e6(c.minimum_premium_usdc, 2)} {TUSDC_SYMBOL}</p>;
  const top = Math.max(25, Math.ceil(open / 5) * 5);
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  return <div className={`apr ${compact ? 'apr-compact' : ''}`} role="img" aria-label={`Auction quoted ${floor.toFixed(1)}% to ${open.toFixed(1)}% APR; ${paid === null ? 'no premium paid' : `paid ${paid.toFixed(1)}% APR`}`}>
    <div className="apr-track">
      <span className="apr-band" style={{ left: at(floor), right: `calc(100% - ${at(open)})` }} />
      {paid !== null && <span className="apr-mark" style={{ left: at(paid) }}><i /></span>}
    </div>
    <div className="apr-scale"><span>{floor.toFixed(1)}%</span><span className="apr-mid">{paid === null ? 'no premium paid' : `paid ${paid.toFixed(1)}% APR`}</span><span>{open.toFixed(1)}%</span></div>
  </div>;
}

/** A covered-call round as a perforated ticket: the body carries the terms, the stub carries the verdict. */
export function Ticket({ c, now, onOpen, lead = false }: { c: Round; now: number; onOpen?: () => void; lead?: boolean }) {
  const ph = roundPhase(c, now);
  const paid = annualisedPct(c);
  const expired = c.expiry_ns / 1e6 <= now;
  return <article className={`ticket tk-${ph.phase} ${lead ? 'ticket-lead' : ''}`}><div className="tk-paper">
    <div className="tk-body">
      <header className="tk-top">
        <span className="tk-kind">Covered call <b>#{c.id}</b></span>
        <Link to={`/vault/${c.token_id}`} className="tk-box">{short(c.token_id, 12, 6)}</Link>
      </header>
      <div className="tk-strike"><small>Strike</small><b>${e6(c.strike_usd_e6, 0)}</b></div>
      <dl className="tk-cells">
        <div><dt>Size</dt><dd>{btcFromSats(c.size_sats)} <small>BTC</small></dd></div>
        <div><dt>Premium</dt><dd>{c.premium_paid_usdc ? <Amount e6={c.premium_paid_usdc} unit={TUSDC_SYMBOL} /> : <span className="dim">none yet</span>}</dd></div>
        <div><dt>{expired ? 'Expired' : 'Expires'}</dt><dd>{utcTime(c.expiry_ns)} <small>UTC<span className="tk-when"> · {utcDay(c.expiry_ns)}</span></small></dd></div>
      </dl>
      <AprRange c={c} compact />
    </div>
    <div className="tk-stub">
      <span className={`stamp stamp-${ph.phase}`}>{ph.short}</span>
      <div className="tk-apr"><b>{paid === null ? '—' : paid.toFixed(1)}<small>{paid === null ? '' : '%'}</small></b><span>{paid === null ? ph.label : 'annualised'}</span></div>
      {onOpen && <button className="tk-open" onClick={onOpen}>Round <Icon name="arrow" size={15} /></button>}
    </div>
  </div></article>;
}

type Step = { k: string; title: string; value: ReactNode; when?: string; done: boolean; bad?: boolean; tx?: string | null };
export function loopSteps(c: CoveredCall, now: number): Step[] {
  const ev = evidenceFor(c);
  const ph = roundPhase(c, now);
  const sold = !!c.premium_paid_usdc;
  const settled = !!c.oracle_price_usd_e6;
  const ended = c.expiry_ns / 1e6 <= now;
  return [
    { k: '1', title: 'Written', value: <>strike ${e6(c.strike_usd_e6, 0)} · {btcFromSats(c.size_sats)} BTC</>, when: `${utcTime(c.opened_ns)} UTC`, done: true, tx: ev?.write },
    { k: '2', title: sold ? 'Sold' : ph.phase === 'live' ? 'In auction' : 'No buyer', value: sold ? <><Amount e6={c.premium_paid_usdc} unit={TUSDC_SYMBOL} /> premium</> : ph.phase === 'live' ? 'Dutch auction falling' : 'auction closed unfilled', done: sold, bad: !sold && ph.phase !== 'live', tx: ev?.buy },
    { k: '3', title: ended ? 'Expired' : 'Expires', value: tenorLabel(callTenorSec(c)) + ' tenor', when: `${utcTime(c.expiry_ns)} UTC`, done: ended },
    { k: '4', title: settled ? 'Settled' : 'Settlement', value: settled ? <>BTC-USD ${e6(c.oracle_price_usd_e6!, 2)} · relayer price (testnet)</> : sold ? 'waiting for the signed print' : 'nothing to settle', done: settled, tx: ev?.settle },
    { k: '5', title: ph.phase === 'itm' ? 'Exercised' : ph.phase === 'otm' ? 'Released' : 'Outcome', value: ph.phase === 'itm' ? 'strike paid, MPC signed the sats to the buyer' : ph.phase === 'otm' ? 'collateral back to the writer, premium kept' : ph.label, done: ph.phase === 'itm' || ph.phase === 'otm', tx: ph.phase === 'itm' ? (ev?.mpc || ev?.strike) : ev?.release },
  ];
}

/** The live loop of one round as numbered tumblers: written → sold → expired → settled → exercised or released. */
export function Loop({ c, now, horizontal = false, compact = false }: { c: CoveredCall; now: number; horizontal?: boolean; compact?: boolean }) {
  return <ol className={`loop ${compact ? 'loop-c' : horizontal ? 'loop-h' : ''}`}>{loopSteps(c, now).map(s => <li key={s.k} className={s.done ? 'done' : s.bad ? 'bad' : ''}>
    <span className="loop-dot">{s.done ? <Icon name="check" size={14} /> : s.bad ? <Icon name="x" size={13} /> : s.k}</span>
    <div className="loop-copy">
      <b>{s.title}{s.when && <small>{s.when}</small>}</b>
      {!compact && <span>{s.value}</span>}
      {!compact && s.tx && <a href={nearblocksTx(s.tx)} target="_blank" rel="noreferrer" className="loop-tx">{short(s.tx, 6, 4)} <Icon name="external" size={12} /></a>}
    </div>
  </li>)}</ol>;
}

/** Concentric vault-door dial; the bright arc is the value on a 0–`max` scale. */
export function Dial({ value, max = 25, label, sub }: { value: number | null; max?: number; label: ReactNode; sub: ReactNode }) {
  const r = 78, c = 2 * Math.PI * r, f = value === null ? 0 : Math.min(1, value / max);
  return <div className="dial">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="96" className="dial-rim" />
      {Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2; const long = i % 12 === 0; const r1 = long ? 84 : 88; return <line key={i} x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * 92} y2={100 - Math.cos(a) * 92} className={long ? 'dial-tick dial-tick-l' : 'dial-tick'} />; })}
      <circle cx="100" cy="100" r={r} className="dial-track" />
      <circle cx="100" cy="100" r={r} className="dial-arc" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 100 100)" />
      <circle cx="100" cy="100" r="58" className="dial-face" />
      <circle cx="100" cy="100" r="44" className="dial-inner" />
    </svg>
    <div className="dial-read"><b>{label}</b><span>{sub}</span></div>
  </div>;
}

export type TickerItem = { k: string; v: ReactNode; tone?: 'ice' | 'gold' | 'dim' };
/** A slow tape of live facts. Duplicated once so the loop is seamless; static when motion is reduced. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (!items.length) return <div className="ticker ticker-empty"><span className="tick-item"><i className="pulse" /> Reading NEAR testnet…</span></div>;
  const row = (dup: boolean) => items.map((t, i) => <span key={`${dup}-${i}`} className={`tick-item tick-${t.tone || 'ice'}`} aria-hidden={dup || undefined}><em>{t.k}</em>{t.v}</span>);
  return <div className="ticker" role="marquee" aria-label="Live from NEAR testnet"><div className="ticker-track" style={{ animationDuration: `${Math.max(30, items.length * 7)}s` }}>{row(false)}{row(true)}</div></div>;
}
