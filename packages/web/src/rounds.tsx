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

