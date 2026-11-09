import { useEffect, useState } from 'react';
import { useCallConfig, useNow, useTusdc, view } from './data';
import { annualisedPct, btcFromSats, contractId, e6, nearblocksAccount, nearblocksTx, roundPhase, short, tenorLabel, TUSDC_SYMBOL, utcDay, utcTime, type Round } from './lib';
import { AprRange, evidenceFor, Loop, pct } from './rounds';
import { Amount, Icon, Link, Sheet } from './ui';
import { sendCall, type Wallet } from './wallet';

/** One covered-call round in full: verdict, auction band, live loop with tx links, terms, and Buy while the auction is open. */
export function RoundSheet({ r, wallet, onClose }: { r: Round; wallet: Wallet; onClose: () => void }) {
  const now = useNow();
  const ph = roundPhase(r, now);
  const cfg = useCallConfig();
  const bal = useTusdc(wallet.account);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  const ev = evidenceFor(r);
  useEffect(() => { if (ph.phase !== 'live' || !contractId) return; view<string | null>(contractId, 'auction_price', { token_id: r.token_id }).then(p => setAsking(p)).catch(e => setErr((e as Error).message)); }, [r.key, Math.floor(now / 15000)]);
  const token = r.premium_token || cfg.data?.premium_token || '';
  async function buy() {
    setBusy(true); setErr(''); setMsg('');
    try {
      if (!asking) throw new Error('The auction has closed');
      if (!token) throw new Error('Setup required: call_config premium token');
      if (!bal.data || BigInt(bal.data) < BigInt(asking)) throw new Error(`Setup required: ${TUSDC_SYMBOL} balance on ${wallet.account}`);
      const h = await sendCall(wallet, token, 'ft_transfer_call', { receiver_id: contractId, amount: asking, msg: `buy:${r.token_id}` }, '1');
      setHash(h); setMsg(h ? 'Premium sent. The round shows Sold once the callback settles.' : 'Finish the transaction in your wallet.');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <Sheet label={`Round ${r.id} on ${r.token_id}`} onClose={onClose}>
    <p className="lbl">Covered call · round #{r.id} · {utcDay(r.opened_ns)}</p>
    <h2 className="sheet-h">Strike ${e6(r.strike_usd_e6, 0)}<span> on {btcFromSats(r.size_sats)} BTC</span></h2>
    <div className={`sheet-verdict tk-${ph.phase}`}>
      <span className={`stamp stamp-${ph.phase}`}>{ph.short}</span>
      <div><b>{ph.label}</b><span>{r.premium_paid_usdc ? <><Amount e6={r.premium_paid_usdc} unit={TUSDC_SYMBOL} /> premium · {pct(annualisedPct(r))} annualised</> : 'No premium paid'}</span></div>
    </div>
    <AprRange c={r} />
    <Loop c={r} now={now} />
    <dl className="sheet-kv">
      <div><dt>Writer</dt><dd><a href={nearblocksAccount(r.writer)} target="_blank" rel="noreferrer">{short(r.writer, 14, 8)}</a></dd></div>
      <div><dt>Holder</dt><dd>{r.holder ? <a href={nearblocksAccount(r.holder)} target="_blank" rel="noreferrer">{short(r.holder, 14, 8)}</a> : 'No buyer'}</dd></div>
      <div><dt>Tenor</dt><dd>{tenorLabel((r.expiry_ns - r.opened_ns) / 1e9)} · expiry {utcTime(r.expiry_ns)} UTC</dd></div>
      <div><dt>Collateral</dt><dd>{Number(r.collateral_sats).toLocaleString()} sats · regtest</dd></div>
      <div><dt>Auction</dt><dd><Amount e6={r.opening_premium_usdc} digits={6} /> → <Amount e6={r.minimum_premium_usdc} digits={6} /> {TUSDC_SYMBOL}</dd></div>
      <div><dt>Settled at</dt><dd>{r.oracle_price_usd_e6 ? `$${e6(r.oracle_price_usd_e6, 2)} · relayer price (testnet)` : 'Not settled'}</dd></div>
    </dl>
    {ph.phase === 'live' && <div className="sheet-buy">
      <div><p className="lbl">Asking now</p><p className="sheet-ask">{asking ? <Amount e6={asking} unit={TUSDC_SYMBOL} /> : '…'}</p></div>
      {wallet.account ? <button className="pill pill-gold" onClick={buy} disabled={busy || !asking}>{busy ? 'Signing…' : `Buy with ${TUSDC_SYMBOL}`}</button>
        : <button className="pill pill-ice" onClick={wallet.connect} disabled={!wallet.ready}>Connect to buy</button>}
    </div>}
    {err && <p className="err-line" role="alert">{err}</p>}
    {msg && <p className="ok-line" role="status">{msg} {hash && <a href={nearblocksTx(hash)} target="_blank" rel="noreferrer">View on NearBlocks <Icon name="external" size={12} /></a>}</p>}
    <div className="sheet-actions">
      <Link to={`/vault/${r.token_id}`} className="pill pill-ghost">Open the vault <Icon name="arrow" size={15} /></Link>
    </div>
    <p className="sheet-note">{ev ? 'Transaction links come from the recorded run (scripts/demo-calls.sh); every figure above is a live contract read.' : 'Every figure above is a live contract read.'} {TUSDC_SYMBOL} is Hako's own test token with no value; Bitcoin is Core regtest.</p>
  </Sheet>;
}

