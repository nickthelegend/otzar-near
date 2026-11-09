import { useEffect, useMemo, useState } from 'react';
import { rpcQuery } from '@hako/sdk';
import { useBoxes, useCallConfig, useMedia, useNow, useRelayer, useRounds, useTusdc } from './data';
import { ago, annualisedPct, btcFromSats, contractId, e6, earnedSummary, nearblocksAccount, nearblocksTx, roundPhase, short, tenorLabel, TUSDC_SYMBOL, utcDay, utcTime, type Round } from './lib';
import { AprRange, Dial, evidenceFor, Loop, pct, Ticket } from './rounds';
import { Amount, Glow, Icon, Link, Sheet, State } from './ui';
import { sendCall, type Wallet } from './wallet';

type Filter = 'all' | 'paid' | 'open' | 'unfilled';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'open', label: 'Open' }, { id: 'unfilled', label: 'Unfilled' }];

/** Your position: live tUSDC balance, vaults and rounds you wrote, beside the vault-door dial of everything Hako earned. */
export function Position({ wallet, rounds }: { wallet: Wallet; rounds: Round[] | null }) {
  const bal = useTusdc(wallet.account);
  const boxes = useBoxes();
  const all = rounds ? earnedSummary(rounds) : null;
  const mine = rounds?.filter(r => r.writer === wallet.account) || [];
  const mineSum = earnedSummary(mine);
  const owned = boxes.data?.filter(b => b.owner_id === wallet.account).length;
  return <section className="position" aria-label="Your position">
    <div className="pos-copy">
      <p className="lbl">{wallet.account ? <>Your {TUSDC_SYMBOL} · <span className="mono">{short(wallet.account, 14, 8)}</span></> : 'Your position'}</p>
      {wallet.account
        ? <p className="pos-big">{bal.data !== null ? <Amount e6={bal.data} unit={TUSDC_SYMBOL} /> : bal.error ? <span className="pos-dim" title={bal.error}>Unavailable</span> : <span className="pos-dim">Loading…</span>}</p>
        : <p className="pos-big pos-dim">Not connected</p>}
      {wallet.account ? <dl className="pos-meta">
        <div><dt>Vaults you own</dt><dd>{owned ?? '…'}</dd></div>
        <div><dt>Rounds you wrote</dt><dd>{rounds ? mine.length : '…'}</dd></div>
        <div><dt>Premium you earned</dt><dd>{rounds ? <Amount e6={mineSum.earned} /> : '…'}</dd></div>
      </dl> : <div className="pos-cta">
        <button className="pill pill-ice" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect NEAR testnet</button>
        <Link to="/vaults" className="pill pill-ghost">Browse vaults</Link>
      </div>}
    </div>
    <div className="pos-dial">
      <Dial value={all?.blended ?? null} label={all?.blended != null ? `${all.blended.toFixed(1)}%` : rounds ? '0%' : '…'} sub="annualised, all paid rounds" />
      <p className="pos-dial-note">{all ? <><Amount e6={all.earned} unit={TUSDC_SYMBOL} /> premium paid to writers on testnet</> : 'Reading rounds…'}</p>
    </div>
    <Glow name="dial" className="pos-glow" />
  </section>;
}

function RelayerCard() {
  const relayer = useRelayer();
  const now = useNow(10000);
  const p = relayer.data;
  return <section className="side-card relayer" aria-label="Settlement price">
    <p className="lbl">Settlement price</p>
    {p ? <>
      <p className="relayer-px">${e6(p.price_usd_e6, 2)}</p>
      <p className="relayer-meta"><span className="tag">{p.label}</span> BTC-USD · {ago(p.publish_time_sec * 1e9, now)}</p>
      <p className="relayer-src">Coinbase last trade, signed by the Hako relayer key and checked on-chain by <code>post_relayer_price</code>.</p>
    </> : relayer.error ? <p className="err-line">{relayer.error}</p> : p === null && !relayer.loading ? <p className="relayer-meta">No price posted yet. Run <code>scripts/price-relayer.mjs</code>.</p> : <p className="relayer-meta"><i className="pulse" /> Reading the relayer price…</p>}
  </section>;
}

function YieldBars({ rounds, selected, onPick }: { rounds: Round[]; selected: string; onPick: (k: string) => void }) {
  const list = [...rounds].reverse();
  const vals = list.map(r => annualisedPct(r));
  const top = Math.max(20, ...vals.map(v => v ?? 0));
  return <section className="side-card bars" aria-label="Annualised yield by round">
    <div className="bars-head"><p className="lbl">Yield by round</p><span className="dim">annualised on strike notional</span></div>
    <div className="bars-plot">{list.map((r, i) => { const v = vals[i]; return <button key={r.key} className={`ybar ${r.key === selected ? 'on' : ''} ${v === null ? 'ybar-none' : ''}`} onClick={() => onPick(r.key)} aria-label={`Round ${r.id} on ${r.token_id}: ${v === null ? 'no premium' : `${v.toFixed(1)}%`}`}>
      <span className="bar-v">{v === null ? '—' : `${v.toFixed(1)}%`}</span>
      <span className="bar-col"><i style={{ height: `${v === null ? 4 : Math.max(6, (v / top) * 100)}%` }} /></span>
      <span className="bar-k">{r.token_id.replace(/^call-/, '').slice(0, 8)}</span>
    </button>; })}</div>
  </section>;
}

export function RoundSheet({ r, wallet, onClose }: { r: Round; wallet: Wallet; onClose: () => void }) {
  const now = useNow();
  const ph = roundPhase(r, now);
  const cfg = useCallConfig();
  const bal = useTusdc(wallet.account);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  const ev = evidenceFor(r);
  useEffect(() => { if (ph.phase !== 'live' || !contractId) return; rpcQuery(contractId, 'auction_price', { token_id: r.token_id }).then(p => setAsking(p)).catch(e => setErr((e as Error).message)); }, [r.key, Math.floor(now / 15000)]);
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

export default function Earn({ wallet }: { wallet: Wallet }) {
  const rounds = useRounds();
  const now = useNow(5000);
  const wide = useMedia('(min-width: 1080px)');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState('');
  const [sheet, setSheet] = useState<Round | null>(null);
  const list = useMemo(() => (rounds.data || []).filter(r => {
    const ph = roundPhase(r, now).phase;
    return filter === 'all' || (filter === 'paid' ? !!r.premium_paid_usdc : filter === 'open' ? ph === 'live' || ph === 'sold' : ph === 'unfilled');
  }), [rounds.data, filter, Math.floor(now / 30000)]);
  const paidFirst = rounds.data?.find(r => r.premium_paid_usdc) || rounds.data?.[0];
  const sel = rounds.data?.find(r => r.key === selected) || paidFirst;
  const count = (f: Filter) => (rounds.data || []).filter(r => { const ph = roundPhase(r, now).phase; return f === 'all' || (f === 'paid' ? !!r.premium_paid_usdc : f === 'open' ? ph === 'live' || ph === 'sold' : ph === 'unfilled'); }).length;

  const loop = sel && <section className="side-card loop-card" aria-label="The live loop">
    <div className="loop-head"><p className="lbl">The loop · round #{sel.id}</p><Link to={`/vault/${sel.token_id}`} className="mono dim">{short(sel.token_id, 10, 6)}</Link></div>
    <Loop c={sel} now={now} horizontal={!wide} />
  </section>;

  return <div className="page earn">
    <Position wallet={wallet} rounds={rounds.data} />
    <div className="earn-grid">
      <div className="earn-main">
        <header className="sec-head">
          <div><p className="lbl">Covered-call rounds · NEAR testnet</p><h1>Every round the vaults offered.</h1></div>
          <div className="filters" role="tablist" aria-label="Filter rounds">{FILTERS.map(f => <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}<small>{rounds.data ? count(f.id) : ''}</small></button>)}</div>
        </header>
        {!wide && loop}
        {rounds.error && !rounds.data ? <State kind="error" title="Could not read the rounds" action={<button className="pill pill-ghost pill-sm" onClick={rounds.reload}>Retry</button>}>{rounds.error}</State>
          : !rounds.data ? <div className="tickets">{[0, 1, 2].map(i => <div key={i} className="ticket skeleton" />)}</div>
          : list.length ? <div className="tickets">{list.map(r => <div key={r.key} className={`tk-slot ${sel?.key === r.key ? 'tk-sel' : ''}`} onClick={() => setSelected(r.key)}><Ticket c={r} now={now} onOpen={() => setSheet(r)} /></div>)}</div>
          : <State kind="empty" title={filter === 'open' ? 'No round is open right now' : 'No rounds here'}>A vault owner writes a round from the vault's Earn tab, signed with their ML-DSA key.</State>}
        {rounds.error && rounds.data && <p className="stale">Showing the last read. Refresh failed: {rounds.error}</p>}
        <p className="fine">Annualised yield is premium ÷ (strike × size) × 365 d ÷ tenor. The recorded rounds ran for about four minutes, so a small premium annualises to a normal-looking rate; the auction was quoted between roughly 5% and 20% APR. Demo terms, not a forecast. Upside above the strike is given up.</p>
      </div>
      <aside className="earn-rail" aria-label="Round detail">
        {wide && loop}
        <RelayerCard />
        {rounds.data && rounds.data.length > 0 && <YieldBars rounds={rounds.data} selected={sel?.key || ''} onPick={setSelected} />}
      </aside>
    </div>
    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
