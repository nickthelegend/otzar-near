import { useBoxes, useNow, useRelayer, useRounds, useTxns } from './data';
import { ago, e6, earnedSummary, roundPhase, short, TUSDC_SYMBOL } from './lib';
import { Ticker, type TickerItem } from './rounds';

/** The live tape: relayer price, premium earned, the latest rounds, vault count and contract transactions. */
export default function LiveTape() {
  const now = useNow(15000);
  const relayer = useRelayer(), rounds = useRounds(), boxes = useBoxes(), txns = useTxns();
  const items: TickerItem[] = [];
  if (relayer.data) items.push({ k: 'BTC-USD', v: <>${e6(relayer.data.price_usd_e6, 2)} <small>relayer price (testnet) · {ago(relayer.data.publish_time_sec * 1e9, now)}</small></> });
  if (rounds.data) {
    const s = earnedSummary(rounds.data);
    if (s.paid.length) items.push({ k: 'Earned', v: <>{e6(s.earned, 6)} {TUSDC_SYMBOL} <small>{s.blended?.toFixed(2)}% annualised · {s.paid.length} paid rounds</small></>, tone: 'gold' });
    for (const c of rounds.data.slice(0, 4)) {
      const ph = roundPhase(c, now);
      items.push({ k: `Round #${c.id} · ${short(c.token_id, 9, 4)}`, v: <>{ph.label}{c.premium_paid_usdc ? <small> · premium {e6(c.premium_paid_usdc, 6)} {TUSDC_SYMBOL}</small> : null}</>, tone: c.premium_paid_usdc ? 'gold' : 'ice' });
    }
  }
  if (boxes.data) items.push({ k: 'Vaults', v: <>{boxes.data.length} NFTs <small>{boxes.data.filter(b => b.pq_key?.length).length} sealed with ML-DSA</small></> });
  for (const t of (txns.data || []).slice(0, 5)) items.push({ k: t.method, v: <small>{short(t.signer, 12, 6)} · {t.ok ? 'ok' : 'rejected'} · {ago(t.ns, now)}</small>, tone: 'dim' });
  const err = relayer.error || rounds.error || boxes.error;
  if (!items.length && err) return <div className="ticker ticker-empty" role="alert"><span className="tick-item tick-dim"><em>Live tape</em>{err}</span></div>;
  return <Ticker items={items} />;
}
