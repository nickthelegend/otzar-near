import { useMemo, useState } from 'react';
import Candles, { type Line } from './Candles';
import { askAt } from './Market';
import { useCallConfig, useNow, useRounds, useTusdc, view } from './data';
import { useBtcPrice, useCandles, usd } from './live';
import { aprFor, btcFromSats, contractId, countdown, e6, isPublicVault, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, type Round } from './lib';
import { Icon } from './ui';
import { sendCall, type Wallet } from './wallet';

const TF = { '15m': 900, '1h': 3600, '6h': 21600 } as const;

/** Buy calls, laid out like Seter's terminal: candles with every open strike, the call book below, a buy ticket right. */
export default function MarketV5({ wallet }: { wallet: Wallet }) {
  const rounds = useRounds(); const price = useBtcPrice(); const now = useNow(1000);
  const [tf, setTf] = useState<keyof typeof TF>('1h'); const candles = useCandles(TF[tf]);
  const open = (rounds.data || []).filter(r => roundPhase(r, now).phase === 'live' && isPublicVault(r.token_id));
  const [pick, setPick] = useState(''); const sel = open.find(r => r.key === pick) || open[0];
  const sold = (rounds.data || []).filter(r => r.premium_paid_usdc && isPublicVault(r.token_id)).slice(0, 6);
  const lines: Line[] = useMemo(() => open.slice(0, 4).map(r => ({ price: Number(r.strike_usd_e6) / 1e6, title: r.key === sel?.key ? 'Selected strike' : 'Strike', tone: r.key === sel?.key ? 'gold' : 'ink' })), [open.map(r => r.key).join(), sel?.key]);

  return <div className="t5">
    <header className="c5-head"><h1>Buy calls</h1><p>Pay a premium now for BTC at a fixed price later.</p></header>
    <div className="t5-grid">
      <section className="c5-card t5-chart" aria-label="BTC-USD chart">
        <div className="c5-tabs"><b>BTC / USD</b><b className="tnum">{price.price ? usd(price.price) : '…'}</b><div className="c5-tf">{(Object.keys(TF) as (keyof typeof TF)[]).map(k => <button key={k} aria-pressed={tf === k} onClick={() => setTf(k)}>{k}</button>)}</div></div>
        {candles.data ? <Candles data={candles.data} lines={lines} /> : <p className="c5-empty">{candles.error || 'Loading Coinbase candles…'}</p>}
      </section>
      <aside className="c5-card c5-ticket" aria-label="Buy ticket">
        <h3 className="c5-ticket-h">Buy call</h3>
        {sel ? <BuyTicket r={sel} wallet={wallet} now={now} /> : <p className="c5-empty">No calls for sale right now.</p>}
      </aside>
    </div>
    <section className="c5-card c5-table" aria-label="Calls for sale">
      <div className="c5-tabs"><b>For sale</b><span className="c5-count">{open.length}</span></div>
      {!rounds.data ? <p className="c5-empty">{rounds.error || 'Reading the contract…'}</p> : !open.length ? <p className="c5-empty">Nothing for sale. Sold calls below.</p> :
        <table><thead><tr><th>Vault</th><th>Strike</th><th>Size</th><th>Ask now</th><th>Expires</th><th /></tr></thead><tbody>
          {open.map(r => <tr key={r.key} className={r.key === sel?.key ? 'on' : ''}><td>{short(r.token_id, 16, 4)}</td><td className="tnum">{usd(Number(r.strike_usd_e6) / 1e6, 0)}</td><td className="tnum">{btcFromSats(r.size_sats)} BTC</td><td className="tnum">{e6(String(askAt(r, now)), 4)} {TUSDC_SYMBOL}</td><td>{new Date(r.expiry_ns / 1e6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td><button className="o-btn o-btn-line o-btn-sm" onClick={() => setPick(r.key)}>Select</button></td></tr>)}
        </tbody></table>}
      {sold.length > 0 && <><div className="c5-tabs"><b>Recently sold</b></div><table><tbody>{sold.map(r => { const a = aprFor(r, r.premium_paid_usdc!); return <tr key={r.key}><td>{short(r.token_id, 16, 4)}</td><td className="tnum">{usd(Number(r.strike_usd_e6) / 1e6, 0)}</td><td className="tnum">{btcFromSats(r.size_sats)} BTC</td><td className="tnum">{e6(r.premium_paid_usdc!, 4)} {TUSDC_SYMBOL}</td><td className="tnum">{a === null ? 'demo round' : `${a.toFixed(1)}% APY`}</td><td /></tr>; })}</tbody></table></>}
    </section>
  </div>;
}

function BuyTicket({ r, wallet, now }: { r: Round; wallet: Wallet; now: number }) {
  const bal = useTusdc(wallet.account); const cfg = useCallConfig();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  const ask = askAt(r, now); const token = r.premium_token || cfg.data?.premium_token || '';
  const apr = aprFor(r, ask);
  async function buy() {
    setBusy(true); setErr('');
    try {
      const asking = await view<string | null>(contractId!, 'auction_price', { token_id: r.token_id });
      if (!asking) throw new Error('The auction has closed');
      if (!bal.data || BigInt(bal.data) < BigInt(asking)) throw new Error(`Not enough ${TUSDC_SYMBOL}`);
      setHash(await sendCall(wallet, token, 'ft_transfer_call', { receiver_id: contractId, amount: asking, msg: `buy:${r.token_id}` }, '1'));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="c5-form">
    <div className="c5-earn"><span>You pay now</span><b>{e6(String(ask), 4)} {TUSDC_SYMBOL}</b><em>falls to {e6(r.minimum_premium_usdc, 4)} in {countdown(r.auction_end_ns / 1e6 - now)}</em></div>
    <dl className="c5-dl">
      <div><dt>Right to buy</dt><dd>{btcFromSats(r.size_sats)} BTC</dd></div>
      <div><dt>At</dt><dd>{usd(Number(r.strike_usd_e6) / 1e6, 0)}</dd></div>
      <div><dt>Until</dt><dd>{new Date(r.expiry_ns / 1e6).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</dd></div>
      <div><dt>Backed by</dt><dd>{r.collateral_outpoint_hex === 'nbtc' ? 'Bridged BTC in the vault' : 'Bitcoin UTXO'}</dd></div>
      <div><dt>Writer earns</dt><dd>{apr === null ? '—' : `${apr.toFixed(1)}% APY`}</dd></div>
      <div><dt>Your {TUSDC_SYMBOL}</dt><dd>{!wallet.account ? '—' : bal.data ? e6(bal.data, 2) : '…'}</dd></div>
    </dl>
    {hash ? <p className="c5-ok"><Icon name="check" size={14} /> Bought · premium paid to the writer · <a className="mono" href={nearblocksTx(hash)} target="_blank" rel="noreferrer">{short(hash, 6, 4)} <Icon name="external" size={11} /></a></p>
      : wallet.account ? <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={buy} disabled={busy}>{busy ? 'Waiting for approval…' : `Buy · pay ${e6(String(ask), 4)} ${TUSDC_SYMBOL}`}</button>
      : <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={wallet.connect} disabled={!wallet.ready}>Connect wallet</button>}
    {err && <p className="c5-err" role="alert">{err}</p>}
  </div>;
}
