import { useState } from 'react';
import { Card, v3art } from './blocks';
import { PriceChart } from './charts';
import { useCallConfig, useNow, useRounds, useTusdc, view } from './data';
import { useBtcPrice, useCandles, usd } from './live';
import { btcFromSats, contractId, countdown, e6, isPublicVault, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, utcDay, utcTime, type Round } from './lib';
import { PageHead } from './shell';
import { Icon, Link, State } from './ui';
import { sendCall, type Wallet } from './wallet';

/** The Dutch-auction ask the contract computes, evaluated locally every second between contract reads. */
export function askAt(r: Round, ms: number) {
  const o = Number(r.opening_premium_usdc), m = Number(r.minimum_premium_usdc), t0 = r.opened_ns / 1e6, t1 = r.auction_end_ns / 1e6;
  if (ms >= t1) return m; if (ms <= t0) return o;
  return Math.floor(o - ((o - m) * (ms - t0)) / (t1 - t0));
}

/** Babylon-style order box: what you pay, what you get, and one button. */
export function BuyBox({ r, wallet, onDone }: { r: Round; wallet: Wallet; onDone?: (hash: string) => void }) {
  const now = useNow(1000); const bal = useTusdc(wallet.account); const cfg = useCallConfig();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  const ask = askAt(r, now); const token = r.premium_token || cfg.data?.premium_token || '';
  const open = roundPhase(r, now).phase === 'live';
  async function buy() {
    setBusy(true); setErr('');
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      const asking = await view<string | null>(contractId, 'auction_price', { token_id: r.token_id });
      if (!asking) throw new Error('The auction has closed');
      if (!token) throw new Error('Setup required: call_config premium token');
      if (!bal.data || BigInt(bal.data) < BigInt(asking)) throw new Error(`Not enough ${TUSDC_SYMBOL}: you have ${bal.data ? e6(bal.data) : '0'}, the ask is ${e6(asking, 6)}`);
      const h = await sendCall(wallet, token, 'ft_transfer_call', { receiver_id: contractId, amount: asking, msg: `buy:${r.token_id}` }, '1');
      setHash(h); onDone?.(h);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="o-buy">
    <div className="o-buy-row o-buy-pay"><span>You pay now</span><b className="tnum">{e6(String(ask), 6)} <small>{TUSDC_SYMBOL}</small></b></div>
    <div className="o-buy-row"><span>You get the right to buy</span><b className="tnum">{btcFromSats(r.size_sats)} BTC at ${e6(r.strike_usd_e6, 0)}</b></div>
    <div className="o-buy-row"><span>Until</span><b className="tnum">{utcDay(r.expiry_ns)} {utcTime(r.expiry_ns)} UTC</b></div>
    <div className="o-buy-row"><span>Ask falls to</span><b className="tnum">{e6(r.minimum_premium_usdc, 6)} in {countdown(r.auction_end_ns / 1e6 - now)}</b></div>
    <div className="o-buy-row o-buy-bal"><span>Your {TUSDC_SYMBOL}</span><b className="tnum">{!wallet.account ? '—' : bal.data !== null ? e6(bal.data, 4) : '…'}</b></div>
    {hash ? <p className="o-done" role="status"><Icon name="check" size={16} /> Premium paid to the writer. <a href={nearblocksTx(hash)} target="_blank" rel="noreferrer">View transaction <Icon name="external" size={12} /></a></p>
      : !open ? <p className="o-mute">This auction is closed.</p>
      : wallet.account ? <button className="o-btn o-btn-gold o-btn-block o-btn-lg" onClick={buy} disabled={busy}>{busy ? 'Paying premium…' : `Buy call · pay ${e6(String(ask), 4)} ${TUSDC_SYMBOL}`}</button>
      : <button className="o-btn o-btn-ink o-btn-block o-btn-lg" onClick={wallet.connect} disabled={!wallet.ready}>Connect wallet to buy</button>}
    {err && <p className="o-err" role="alert">{err}</p>}
    <p className="o-fine">The premium goes to the writer the moment you pay. {TUSDC_SYMBOL} is a test token with no value.</p>
  </div>;
}

export default function Market({ wallet }: { wallet: Wallet }) {
  const rounds = useRounds(); const btc = useBtcPrice(); const candles = useCandles(900); const now = useNow(1000);
  const all = rounds.data || [];
  const open = all.filter(r => roundPhase(r, now).phase === 'live');
  const [pick, setPick] = useState<string>('');
  const sel = open.find(r => r.key === pick) || open[0];
  const fills = all.filter(r => r.premium_paid_usdc && isPublicVault(r.token_id)).slice(0, 8);

  return <div className="o-page">
    <PageHead title="Buy calls" sub="Pay a premium now for the right to buy BTC at a fixed price later. Each ask falls every second until someone takes it." />
    <div className="o-grid o-grid-market">
      <div className="o-stack">
        <Card title="BTC-USD and open strikes" action={<span className="o-mute small">Coinbase 15-minute candles · live trade</span>}>
          <PriceChart candles={candles.data?.slice(-96) || null} live={btc.price} height={300}
            levels={open.map(r => ({ value: Number(r.strike_usd_e6) / 1e6, label: r === sel ? 'Strike' : short(r.token_id, 6, 4), tone: r === sel ? 'gold' : 'ink' }))} />
        </Card>
        <Card className="o-card-flush" title={<>{open.length > 0 && <i className="o-live" aria-hidden="true" />}Open auctions <small className="o-count">{rounds.data ? open.length : ''}</small></>}>
          {rounds.error && !rounds.data ? <State kind="error" title="Could not read the rounds" action={<button className="o-btn o-btn-line o-btn-sm" onClick={rounds.reload}>Retry</button>}>{rounds.error}</State>
            : !rounds.data ? <div className="o-table" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="o-tr skeleton" />)}</div>
            : open.length === 0 ? <div className="o-empty"><img src={v3art('otzar-strike-dial')} alt="" /><b>No call is open right now</b><p>Owners write calls from their vaults. When one opens it appears here within seconds.</p><Link to="/write" className="o-btn o-btn-ink">Write one from your vault</Link></div>
            : <div className="o-table o-table-auction" role="table">
              <div className="o-tr o-th" role="row"><span>Vault</span><span>Strike</span><span>Size</span><span>Ask now</span><span>Ends</span></div>
              {open.map(r => <button key={r.key} className={`o-tr ${r === sel ? 'o-tr-on' : ''}`} onClick={() => setPick(r.key)}>
                <span className="o-vault"><img src={v3art('otzar-icon-128')} alt="" width="32" height="32" /><span><b>{r.token_id}</b><small>by {short(r.writer, 12, 6)}</small></span></span>
                <span className="tnum" data-label="Strike">${e6(r.strike_usd_e6, 0)}</span>
                <span className="tnum" data-label="Size">{btcFromSats(r.size_sats)} BTC</span>
                <span className="tnum o-ask-live" data-label="Ask">{e6(String(askAt(r, now)), 6)}</span>
                <span className="tnum" data-label="Ends">{countdown(r.auction_end_ns / 1e6 - now)}</span>
              </button>)}
            </div>}
        </Card>
      </div>
      <aside className="o-side">
        <Card title={sel ? <>Buy the call on <Link to={`/vault/${encodeURIComponent(sel.token_id)}`}>{sel.token_id}</Link></> : 'Buy a call'}>
          {sel ? <BuyBox key={sel.key} r={sel} wallet={wallet} /> : <p className="o-mute">Pick an open auction to see its live ask.</p>}
        </Card>
        <Card title="Recent fills">
          {!rounds.data ? <p className="o-mute">Reading…</p> : !fills.length ? <p className="o-mute">No premiums paid yet.</p>
            : <ul className="o-fills">{fills.map(r => <li key={r.key}><Link to={`/vault/${encodeURIComponent(r.token_id)}`}><b className="tnum">{e6(r.premium_paid_usdc!, 6)} {TUSDC_SYMBOL}</b><small>{short(r.token_id, 14, 6)} · strike ${e6(r.strike_usd_e6, 0)}</small></Link><span className="tnum">{utcDay(r.opened_ns)}</span></li>)}</ul>}
          {contractId && <a className="o-link" href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract on NearBlocks <Icon name="external" size={12} /></a>}
        </Card>
      </aside>
    </div>
  </div>;
}
