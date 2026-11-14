import { useEffect, useMemo, useState } from 'react';
import { signAuthorization, verifyAuthorization } from '@hako/sdk';
import { Buffer } from 'buffer';
import Candles, { type Line, type Mark } from './Candles';
import { btc, NBTC, sats, useNbtcBalance, useNbtcVault } from './bridge';
import { invalidateLiveCache, useBoxes, useLive, useTusdc, view } from './data';
import { keyForVault, loadKeyFile, useKeys } from './keys';
import { annualisedPct, contractId, e6, nearblocksTx, short, type Box, type CoveredCall } from './lib';
import { useBtcPrice, useCandles, usd } from './live';
import { Icon, Link } from './ui';
import { signAndSend, type Wallet } from './wallet';

const TF = { '15m': 900, '1h': 3600, '6h': 21600, '1D': 86400 } as const;
type Tab = 'lock' | 'earn' | 'withdraw';
const live = (c?: CoveredCall | null) => !!c && ['auction', 'purchasing', 'sold', 'settling', 'itm', 'paying', 'paid', 'delivering'].includes(c.state);

export function useVaultCalls(id: string | undefined) {
  return useLive<CoveredCall[]>(id && contractId ? `calls:${id}` : null, () => view<CoveredCall[]>(contractId!, 'call_history', { token_id: id }), 10000);
}

/** The vault terminal: Seter's layout (dark hero, candles, ticket, tables) for one quantum-locked BTC vault. */
export default function Terminal({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes();
  const want = new URLSearchParams(location.search).get('vault');
  const mine = (boxes.data || []).filter(b => b.owner_id === wallet.account && b.pq_key);
  const box = (boxes.data || []).find(b => b.token_id === want) || [...mine].reverse()[0];
  const v = useNbtcVault(box?.token_id); const calls = useVaultCalls(box?.token_id);
  const price = useBtcPrice(); const [tf, setTf] = useState<keyof typeof TF>('1h'); const candles = useCandles(TF[tf]);
  const [tab, setTab] = useState<Tab>('lock'); const [table, setTable] = useState<'calls' | 'holdings'>('calls');
  const current = calls.data?.[calls.data.length - 1];
  const nbtcCalls = (calls.data || []).filter(c => c.collateral_outpoint_hex === 'nbtc');
  const earned = nbtcCalls.reduce((a, c) => a + BigInt(c.premium_paid_usdc || 0), 0n);
  const apy = [...nbtcCalls].reverse().map(annualisedPct).find(x => x !== null) ?? null;
  const lines: Line[] = useMemo(() => live(current) ? [{ price: Number(current!.strike_usd_e6) / 1e6, title: 'Call strike', tone: 'gold' }] : [], [current?.strike_usd_e6, current?.state]);
  const marks: Mark[] = useMemo(() => nbtcCalls.flatMap(c => [{ time: Math.floor(c.opened_ns / 1e9), label: 'Call sold', tone: 'gold' as const }]), [calls.data]);
  const balance = Number(v.data?.balance_sats || 0);

  return <div className="t5">
    <section className="t5-hero" aria-label="Vault">
      <div className="t5-id"><img src="/art/v3/otzar-icon-128.webp" alt="" width="44" height="44" /><div><b>{box ? box.token_id : 'Your vault'}</b><span><Icon name="shield" size={13} /> ML-DSA-65 locked</span></div></div>
      <div className="t5-px"><span>BTC / USD</span><b className="tnum">{price.price ? usd(price.price) : '…'}</b></div>
      <Stat k="Locked" v={`${btc(balance)} BTC`} s={price.price ? usd(balance / 1e8 * price.price) : ''} />
      <Stat k="Backing a call" v={`${btc(v.data?.encumbered_sats || 0)} BTC`} />
      <Stat k="Earned" v={`${e6(earned.toString(), 2)} tUSDC`} />
      <Stat k="APY" v={apy === null ? '—' : `${apy.toFixed(1)}%`} s={apy === null ? 'after the first sale' : 'from the premium paid'} gold />
    </section>

    <div className="t5-grid">
      <section className="c5-card t5-chart" aria-label="BTC-USD chart">
        <div className="c5-tabs"><b>BTC / USD</b><div className="c5-tf">{(Object.keys(TF) as (keyof typeof TF)[]).map(k => <button key={k} aria-pressed={tf === k} onClick={() => setTf(k)}>{k}</button>)}</div>
          {candles.data?.length ? <span className="c5-ohlc mono">O {usd(candles.data.at(-1)!.open, 0)} H {usd(candles.data.at(-1)!.high, 0)} L {usd(candles.data.at(-1)!.low, 0)} C {usd(candles.data.at(-1)!.close, 0)}</span> : null}</div>
        {candles.data ? <Candles data={candles.data} lines={lines} marks={marks} /> : <p className="c5-empty">{candles.error || 'Loading Coinbase candles…'}</p>}
      </section>

      <aside className="c5-card c5-ticket" aria-label="Vault ticket">
        <div className="c5-seg" role="tablist">{(['lock', 'earn', 'withdraw'] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'lock' ? 'Lock' : t === 'earn' ? 'Earn' : 'Withdraw'}</button>)}</div>
        {!wallet.account ? <div className="c5-connect"><p>Connect to use your vault.</p><button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={wallet.connect} disabled={!wallet.ready}>Connect wallet</button></div>
          : !box ? <div className="c5-connect"><p>You have no quantum-locked vault yet.</p><Link to="/vaults" className="o-btn o-btn-ink o-btn-block">Create a vault</Link></div>
          : tab === 'lock' ? <LockTab wallet={wallet} box={box} onDone={() => { v.reload(); }} />
          : tab === 'earn' ? <EarnTab wallet={wallet} box={box} free={Number(v.data?.free_sats || 0)} current={current} spot={price.price} onDone={() => { calls.reload(); v.reload(); boxes.reload(); }} />
          : <WithdrawTab wallet={wallet} box={box} free={Number(v.data?.free_sats || 0)} onDone={() => { v.reload(); boxes.reload(); }} />}
      </aside>
    </div>

    <section className="c5-card c5-table" aria-label="Vault records">
      <div className="c5-tabs"><button aria-pressed={table === 'calls'} onClick={() => setTable('calls')}>Calls <span className="c5-count">{nbtcCalls.length}</span></button><button aria-pressed={table === 'holdings'} onClick={() => setTable('holdings')}>Holdings</button>
        {box && <a className="c5-src" href={`https://testnet.nearblocks.io/address/${contractId}`} target="_blank" rel="noreferrer">{short(contractId || '', 14, 8)} <Icon name="external" size={11} /></a>}</div>
      {table === 'calls' ? (!nbtcCalls.length ? <p className="c5-empty">No calls yet. Sell one from Earn.</p> :
        <table><thead><tr><th>Strike</th><th>Size</th><th>Premium</th><th>APY</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>{[...nbtcCalls].reverse().map(c => { const a = annualisedPct(c); return <tr key={c.id}><td className="tnum">{usd(Number(c.strike_usd_e6) / 1e6, 0)}</td><td className="tnum">{sats(c.size_sats)} sats</td><td className="tnum">{c.premium_paid_usdc ? `${e6(c.premium_paid_usdc, 2)} tUSDC` : `ask ${e6(c.opening_premium_usdc, 2)}`}</td><td className="tnum">{a === null ? '—' : `${a.toFixed(1)}%`}</td><td>{new Date(c.expiry_ns / 1e6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td><span className={`c5-pill ${c.state === 'sold' ? 'ok' : ''}`}>{c.state === 'auction' ? 'For sale' : c.state === 'sold' ? 'Sold · earning' : c.state}</span></td></tr>; })}</tbody></table>)
        : <Holdings wallet={wallet} box={box} v={v.data} />}
    </section>
  </div>;
}

function Stat({ k, v, s, gold }: { k: string; v: string; s?: string; gold?: boolean }) { return <div className={`t5-stat ${gold ? 'gold' : ''}`}><span>{k}</span><b className="tnum">{v}</b>{s && <em>{s}</em>}</div>; }

function Holdings({ wallet, box, v }: { wallet: Wallet; box?: Box; v: { balance_sats: string; free_sats: string } | null }) {
  const w = useNbtcBalance(wallet.account); const t = useTusdc(wallet.account);
  return <table><thead><tr><th>Asset</th><th>Where</th><th>Amount</th></tr></thead><tbody>
    <tr><td>nBTC</td><td>Vault {box ? box.token_id : ''}</td><td className="tnum">{btc(v?.balance_sats || 0)} BTC</td></tr>
    <tr><td>nBTC</td><td>Wallet {short(wallet.account || '—', 12, 8)}</td><td className="tnum">{btc(w.data || 0)} BTC</td></tr>
    <tr><td>tUSDC (test)</td><td>Wallet · premiums</td><td className="tnum">{t.data ? e6(t.data, 2) : '…'}</td></tr>
  </tbody></table>;
}

function useTx() {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [hash, setHash] = useState('');
  async function run(label: string, f: () => Promise<string>) { setErr(''); setHash(''); setBusy(label); try { setHash(await f()); invalidateLiveCache(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } }
  return { busy, err, hash, run, setErr };
}
async function send(wallet: Wallet, receiver: string, method: string, args: object, deposit = '0') {
  const r = await signAndSend(wallet.selector, receiver, method, args, deposit, '150000000000000');
  if (r?.status?.Failure) throw new Error(`Refused on chain: ${JSON.stringify(r.status.Failure).match(/panicked: ([^"]+)/)?.[1] || 'see explorer'}`);
  return r?.transaction?.hash || '';
}
function Result({ t, ok }: { t: ReturnType<typeof useTx>; ok: string }) {
  return <>{t.err && <p className="c5-err" role="alert">{t.err}</p>}{t.hash && <p className="c5-ok"><Icon name="check" size={14} /> {ok} · <a href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer" className="mono">{short(t.hash, 6, 4)} <Icon name="external" size={11} /></a></p>}</>;
}

function LockTab({ wallet, box, onDone }: { wallet: Wallet; box: Box; onDone: () => void }) {
  const w = useNbtcBalance(wallet.account); const t = useTx(); const [amt, setAmt] = useState('');
  const have = Number(w.data || 0);
  useEffect(() => { if (have && !amt) setAmt(String(have)); }, [have]);
  const go = () => t.run('lock', async () => { const n = Number(amt); if (!(n > 0 && n <= have)) throw new Error('Enter an amount up to your nBTC balance'); const h = await send(wallet, NBTC, 'ft_transfer_call', { receiver_id: contractId, amount: String(n), msg: `lock:${box.token_id}` }, '1'); onDone(); w.reload(); return h; });
  return <div className="c5-form">
    <div className="c5-field"><span>Wallet</span><div className="c5-from"><i className="n">N</i><b>{btc(have)} nBTC</b><em>bridged</em></div></div>
    {!have ? <Link to="/bridge" className="o-btn o-btn-line o-btn-block">Bridge BTC first <Icon name="arrow" size={15} /></Link> : <>
      <label className="c5-field"><span>Lock</span><div className="c5-input"><input inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value.replace(/\D/g, ''))} aria-label="Sats to lock" /><em>sats</em></div></label>
      <dl className="c5-dl"><div><dt>Into</dt><dd>{box.token_id}</dd></div><div><dt>To take it out</dt><dd>ML-DSA-65 signature</dd></div></dl>
      <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={go} disabled={!!t.busy}>{t.busy ? 'Waiting for approval…' : `Lock ${btc(Number(amt) || 0)} BTC`}</button></>}
    <Result t={t} ok="Locked" />
  </div>;
}

function KeyGate({ box }: { box: Box }) {
  const keys = useKeys(); const key = keyForVault(box.pq_key); const [err, setErr] = useState('');
  void keys;
  return key ? <div className="c5-key ok"><Icon name="key" size={15} /> Quantum key loaded · {key.fingerprint}</div>
    : <label className="c5-key"><input type="file" accept="application/json,.json" aria-label="Load ML-DSA key file" onChange={async e => { const f = e.target.files?.[0]; setErr(''); if (f) try { const k = await loadKeyFile(f); if (keyForVault(box.pq_key)?.publicKey !== k.publicKey) setErr('That key belongs to another vault.'); } catch (x) { setErr((x as Error).message); } }} /><Icon name="key" size={15} /> Load your quantum key{err && <em>{err}</em>}</label>;
}
async function pqSign(box: Box, payload: Uint8Array) {
  const key = keyForVault(box.pq_key); if (!key || !box.pq_key) throw new Error('Load this vault’s quantum key first');
  const file = JSON.parse(await key.file.text());
  const sig = signAuthorization(Buffer.from(file.secretKey, 'base64'), box.token_id, box.nonce, payload);
  if (!verifyAuthorization(Uint8Array.from(box.pq_key), sig, box.token_id, box.nonce, payload)) throw new Error('This key does not match the vault’s on-chain key');
  return Buffer.from(sig).toString('base64');
}

const STRIKES = [5, 10, 15], DAYS = [7, 14, 30];
function EarnTab({ wallet, box, free, current, spot, onDone }: { wallet: Wallet; box: Box; free: number; current?: CoveredCall; spot: number | null; onDone: () => void }) {
  const t = useTx(); const [otm, setOtm] = useState(10); const [days, setDays] = useState(7); const [size, setSize] = useState('');
  useEffect(() => { if (free && !size) setSize(String(free)); }, [free]);
  const n = Number(size) || 0;
  const strike = spot ? Math.round(spot * (1 + otm / 100)) : 0;
  const notional = strike * n / 1e8;
  // The writer’s asking premium: opening 0.5% and floor 0.25% of strike notional per 7 days, scaled by term. The buyer's
  // Dutch-auction payment is what actually lands, and the APY shown elsewhere is computed from that on-chain payment.
  const opening = Math.round(notional * 0.005 * days / 7 * 1e6), minimum = Math.round(opening / 2);
  const apy = notional ? (minimum / 1e6) / notional * 365 / days * 100 : 0;
  if (live(current)) return <div className="c5-form"><div className="c5-live"><b>Call live</b><span>Strike {usd(Number(current!.strike_usd_e6) / 1e6, 0)} · {sats(current!.size_sats)} sats</span><span>{current!.state === 'sold' ? `Premium earned ${e6(current!.premium_paid_usdc || '0', 2)} tUSDC` : `Asking ${e6(current!.opening_premium_usdc, 2)} tUSDC, falling to ${e6(current!.minimum_premium_usdc, 2)}`}</span></div><Link to="/market" className="o-btn o-btn-line o-btn-block">See it in the market <Icon name="arrow" size={15} /></Link><Result t={t} ok="Call listed" /></div>;
  const go = () => t.run('earn', async () => {
    if (!spot) throw new Error('Waiting for the BTC price');
    if (!(n > 0 && n <= free)) throw new Error(`Size must be up to ${sats(free)} sats`);
    const expiry = Math.floor(Date.now() / 1000) + days * 86400;
    const a = { strike_usd_e6: String(strike * 1_000_000), expiry_sec: expiry, size_sats: String(n), opening_premium_usdc: String(opening), minimum_premium_usdc: String(minimum) };
    const payload = new TextEncoder().encode(JSON.stringify(['nbtc', a.strike_usd_e6, a.expiry_sec, a.size_sats, a.opening_premium_usdc, a.minimum_premium_usdc]));
    const signature = await pqSign(box, payload);
    const h = await send(wallet, contractId!, 'write_call_nbtc', { token_id: box.token_id, ...a, nonce: box.nonce, signature }); onDone(); return h;
  });
  return <div className="c5-form">
    <div className="c5-field"><span>Strike</span><div className="c5-chips">{STRIKES.map(s => <button key={s} aria-pressed={otm === s} onClick={() => setOtm(s)}>+{s}%</button>)}</div></div>
    <div className="c5-field"><span>Term</span><div className="c5-chips">{DAYS.map(d => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div></div>
    <label className="c5-field"><span>Size</span><div className="c5-input"><input inputMode="numeric" value={size} onChange={e => setSize(e.target.value.replace(/\D/g, ''))} aria-label="Call size in sats" /><em>sats</em></div></label>
    <div className="c5-earn"><span>You sell the upside above <b>{strike ? usd(strike, 0) : '…'}</b></span><b>{(minimum / 1e6).toFixed(2)}–{(opening / 1e6).toFixed(2)} tUSDC</b><em>≈ {apy.toFixed(0)}–{(apy * 2).toFixed(0)}% APY if it sells</em></div>
    <KeyGate box={box} />
    <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={go} disabled={!!t.busy || !free}>{t.busy ? 'Signing…' : 'Sign and sell call'}</button>
    <Result t={t} ok="Call listed" />
  </div>;
}

function WithdrawTab({ wallet, box, free, onDone }: { wallet: Wallet; box: Box; free: number; onDone: () => void }) {
  const t = useTx(); const [amt, setAmt] = useState('');
  useEffect(() => { if (free && !amt) setAmt(String(free)); }, [free]);
  const go = () => t.run('withdraw', async () => {
    const n = Number(amt); if (!(n > 0 && n <= free)) throw new Error(`Up to ${sats(free)} sats are free`);
    const signature = await pqSign(box, new TextEncoder().encode(`withdraw-nbtc:v1:${wallet.account}:${n}`));
    const h = await send(wallet, contractId!, 'withdraw_nbtc', { token_id: box.token_id, receiver_id: wallet.account, amount: String(n), nonce: box.nonce, signature }, '1'); onDone(); return h;
  });
  return <div className="c5-form">
    <div className="c5-field"><span>Free to withdraw</span><div className="c5-from"><i>₿</i><b>{btc(free)} BTC</b><em>{sats(free)} sats</em></div></div>
    <label className="c5-field"><span>Amount</span><div className="c5-input"><input inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value.replace(/\D/g, ''))} aria-label="Sats to withdraw" /><em>sats</em></div></label>
    <dl className="c5-dl"><div><dt>To</dt><dd>{short(wallet.account, 14, 8)}</dd></div><div><dt>Needs</dt><dd>NEAR key + ML-DSA-65</dd></div></dl>
    <KeyGate box={box} />
    <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={go} disabled={!!t.busy || !free}>{t.busy ? 'Signing…' : 'Sign and withdraw'}</button>
    <Result t={t} ok="Withdrawn" />
  </div>;
}
