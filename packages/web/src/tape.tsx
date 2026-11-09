import { Ticker, type TickerItem } from './art';
import { actionLabel } from './cards';
import { useNow, useRelayer, useRounds, useTxns } from './data';
import { ago, annualisedPct, e6, earnedSummary, roundPhase, short, TUSDC_SYMBOL } from './lib';

/** The live tape: relayer price, premium paid, every round's outcome and the latest contract events. */
export default function LiveTape() {
  const now = useNow(15000);
  const relayer = useRelayer(), rounds = useRounds(), txns = useTxns();
  const items: TickerItem[] = [];
  if (relayer.data) items.push({ k: 'BTC-USD', v: <>${e6(relayer.data.price_usd_e6, 2)} <small>relayer price (testnet) · {ago(relayer.data.publish_time_sec * 1e9, now)}</small></> });
  if (rounds.data) {
    const s = earnedSummary(rounds.data);
    if (s.paid.length) items.push({ k: 'Premium paid', v: <>{e6(s.earned, 6)} {TUSDC_SYMBOL} <small>{s.blended?.toFixed(2)}% realised APY</small></>, tone: 'gold' });
    for (const c of rounds.data.slice(0, 6)) {
      const ph = roundPhase(c, now); const apy = annualisedPct(c);
      items.push({ k: `${short(c.token_id, 10, 4)} #${c.id}`, v: <>{ph.label}{c.oracle_price_usd_e6 ? <small> · settled at ${e6(c.oracle_price_usd_e6, 0)}</small> : null}{apy !== null ? <small> · {apy.toFixed(1)}% APY</small> : null}</>, tone: ph.phase === 'itm' || ph.phase === 'otm' ? 'jade' : ph.phase === 'live' ? 'gold' : 'ink' });
    }
  }
  for (const t of (txns.data || []).slice(0, 6)) items.push({ k: actionLabel(t.method), v: <small>{short(t.signer, 12, 6)} · {t.ok ? 'ok' : 'failed'} · {ago(t.ns, now)}</small> });
  const err = relayer.error || rounds.error;
  return <Ticker items={items} empty={err ? <>Live tape unavailable: {err}</> : <><i className="pulse" /> Reading NEAR testnet…</>} />;
}

/** Live realised APY in the bar, the way Ethena carries its headline number. */
export function ApyChip() {
  const rounds = useRounds();
  const s = rounds.data ? earnedSummary(rounds.data) : null;
  return <span className="apy-chip" title="Realised APY across paid rounds, NEAR testnet"><b>{s?.blended != null ? `${s.blended.toFixed(2)}%` : '…'}</b> APY</span>;
}

