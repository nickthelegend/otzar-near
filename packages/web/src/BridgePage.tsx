import { useEffect, useMemo, useState } from 'react';
import { useLive } from './data';
import { addressTxs, bridgeProgress, btc, btcBalance, CONFIRMATIONS, CONNECTOR, depositAddress, mempoolAddress, mempoolTx, NBTC, sats, useConnector, useLightClient, useNbtcBalance, type BridgeProgress, type BridgeRun } from './bridge';
import { nearblocksTx, short } from './lib';
import { Icon, Link } from './ui';
import type { Wallet } from './wallet';

type QaBtc = { address: string; send: (to: string, sats: number, purpose: string) => Promise<{ txid: string; vout: number }> };
const loadQa = async (): Promise<QaBtc | null> => import.meta.env.MODE === 'qa' && import.meta.env.VITE_QA_SIGNER === '1' ? (await import('./qa-btc')).qaBitcoin() : null;
const FEE = 300;

export default function BridgePage({ wallet }: { wallet: Wallet }) {
  const account = wallet.account;
  const [qa, setQa] = useState<QaBtc | null>(null);
  useEffect(() => { loadQa().then(setQa).catch(() => setQa(null)); }, []);
  const cfg = useConnector(); const lc = useLightClient(); const nbtc = useNbtcBalance(account);
  const dep = useLive<string>(account ? `dep:${account}` : null, () => depositAddress(account), 600000);
  const from = useLive(qa ? `btcbal:${qa.address}` : null, () => btcBalance(qa!.address), 10000);
  // Deposits = real Bitcoin testnet transactions paying this account's bridge address, newest first.
  const runs = useLive<BridgeRun[]>(dep.data ? `runs:${dep.data}` : null, async () => (await addressTxs(dep.data!)).map(t => { const vout = t.vout.findIndex(o => o.scriptpubkey_address === dep.data); return { txid: t.txid, vout, sats: t.vout[vout]?.value || 0, address: dep.data!, account, at: (t.status.block_time || Date.now() / 1000) * 1000 }; }).filter(r => r.vout >= 0), 10000);
  const [sent, setSent] = useState<BridgeRun | null>(null);
  const latest = sent && !runs.data?.some(r => r.txid === sent.txid) ? sent : runs.data?.[0] || sent;
  const prog = useLive<BridgeProgress>(latest ? `prog:${latest.txid}` : null, () => bridgeProgress(latest!), 8000);
  const [amount, setAmount] = useState('0.0006');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const fee = Number(cfg.data?.deposit_bridge_fee.fee_min || 200), min = Number(cfg.data?.min_deposit_amount || 2500);
  const amt = Math.round(Number(amount) * 1e8);
  const available = from.data ? from.data.confirmed + Math.min(0, from.data.pending) : 0;

  async function bridge() {
    setErr('');
    try {
      if (!qa || !dep.data) throw new Error('Connect first');
      if (!(amt >= min)) throw new Error(`The bridge minimum is ${sats(min)} sats`);
      if (amt + FEE > available) throw new Error('Not enough confirmed tBTC in this wallet');
      setBusy(true);
      const r = await qa.send(dep.data, amt, `Bridge ${btc(amt)} tBTC to NEAR. The connector verifies it with a Bitcoin light client, then mints nBTC to ${account}.`);
      setSent({ txid: r.txid, vout: r.vout, sats: amt, address: dep.data, account, at: Date.now() });
      from.reload(); runs.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!account) return <div className="b5"><Head /><div className="c5-card b5-empty"><h2>Connect to bridge</h2><button className="o-btn o-btn-ink o-btn-lg" onClick={wallet.connect} disabled={!wallet.ready}>Connect wallet</button></div></div>;

  return <div className="b5">
    <Head />
    <div className="b5-grid">
      <div className="b5-left">
      <section className="c5-card b5-route" aria-label="Bridge progress">
        <div className="b5-lanes">
          <Lane chain="Bitcoin testnet" glyph="₿" tone="gold" value={latest ? `${btc(latest.sats)} tBTC` : '—'} sub={latest ? short(latest.txid, 10, 8) : 'Waiting for a deposit'} href={latest ? mempoolTx(latest.txid) : dep.data ? mempoolAddress(dep.data) : undefined} />
          <div className="b5-wire" data-on={!!latest}><span /></div>
          <Lane chain="NEAR testnet" glyph="N" tone="jade" value={`${btc(nbtc.data || 0)} nBTC`} sub={short(account, 14, 8)} href={`https://testnet.nearblocks.io/address/${account}?tab=tokentxns`} />
        </div>
        <Steps run={latest} p={prog.data} need={CONFIRMATIONS} fee={fee} />
        {prog.data?.stage === 'minted' && <Link to="/app" className="o-btn o-btn-jade o-btn-lg b5-next">Lock it in your vault <Icon name="arrow" size={16} /></Link>}
      </section>
      <section className="c5-card c5-table" aria-label="Your deposits">
        <div className="c5-tabs"><b>Deposits</b><span className="c5-count">{runs.data?.length ?? 0}</span><a className="c5-src" href={`https://testnet.nearblocks.io/address/${CONNECTOR}`} target="_blank" rel="noreferrer">{CONNECTOR} <Icon name="external" size={11} /></a></div>
        {!runs.data ? <p className="c5-empty">{runs.error || 'Reading Bitcoin testnet…'}</p> : !runs.data.length ? <p className="c5-empty">No deposits yet.</p> :
          <table><thead><tr><th>Bitcoin tx</th><th>Amount</th><th>Minted on NEAR</th><th>Status</th></tr></thead>
            <tbody>{runs.data.map(r => <DepositRow key={r.txid} r={r} />)}</tbody></table>}
      </section>
      </div>

      <aside className="c5-card c5-ticket" aria-label="Bridge ticket">
        <h3 className="c5-ticket-h">Bridge BTC</h3>
        {qa ? <>
          <div className="c5-field"><span>From · Bitcoin testnet</span><div className="c5-from"><i>₿</i><b className="mono">{short(qa.address, 10, 8)}</b><em>{from.data ? `${btc(available)} tBTC` : '…'}</em></div></div>
          <label className="c5-field"><span>Amount</span><div className="c5-input"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount in tBTC" /><em>tBTC</em></div></label>
          <div className="c5-pcts">{[0.25, 0.5, 0.75, 1].map(f => <button key={f} onClick={() => setAmount(btc(Math.max(0, Math.floor((available - FEE) * f))))}>{f === 1 ? 'Max' : `${f * 100}%`}</button>)}</div>
        </> : <div className="c5-field"><span>Send from any Bitcoin testnet wallet</span><div className="c5-addr mono">{dep.data || '…'}</div></div>}
        <div className="c5-field"><span>To · NEAR testnet</span><div className="c5-from"><i className="n">N</i><b className="mono">{short(account, 16, 8)}</b><em>nBTC</em></div></div>
        <dl className="c5-dl">
          <div><dt>Deposit address</dt><dd className="mono" title={dep.data || ''}>{dep.data ? short(dep.data, 10, 6) : '…'} <Icon name="check" size={13} /></dd></div>
          <div><dt>Bitcoin fee</dt><dd>{sats(FEE)} sats</dd></div>
          <div><dt>Bridge fee</dt><dd>{sats(fee)} sats</dd></div>
          <div><dt>You receive</dt><dd><b>{amt > fee ? btc(amt - fee) : '0'} nBTC</b></dd></div>
          <div><dt>Verified by</dt><dd>BTC light client{lc.data ? ` · #${lc.data.block_height.toLocaleString('en-US')}` : ''}</dd></div>
        </dl>
        {qa && <button className="o-btn o-btn-ink o-btn-lg o-btn-block" onClick={bridge} disabled={busy || !dep.data || !from.data}>{busy ? 'Waiting for approval…' : `Bridge ${amount || 0} BTC`}</button>}
        {err && <p className="c5-err" role="alert">{err}</p>}
        {(dep.error || cfg.error) && <p className="c5-err" role="alert">{dep.error || cfg.error}</p>}
      </aside>
    </div>

  </div>;
}

function Head() { return <header className="c5-head"><h1>Bridge</h1><p>Real testnet bitcoin in. nBTC out on NEAR.</p></header>; }

function Lane({ chain, glyph, tone, value, sub, href }: { chain: string; glyph: string; tone: 'gold' | 'jade'; value: string; sub: string; href?: string }) {
  return <div className={`b5-lane b5-${tone}`}><i>{glyph}</i><div><span>{chain}</span><b className="tnum">{value}</b>{href ? <a href={href} target="_blank" rel="noreferrer" className="mono">{sub} <Icon name="external" size={11} /></a> : <em className="mono">{sub}</em>}</div></div>;
}

function Steps({ run, p, need, fee }: { run: BridgeRun | null; p: BridgeProgress | null; need: number; fee: number }) {
  const stage = p?.stage || (run ? 'sent' : 'idle');
  const order = ['sent', 'confirming', 'verifying', 'minted'];
  const at = run ? order.indexOf(stage) : -1;
  const conf = Math.min(need, p?.confirmations || 0);
  const steps = [
    { t: 'Sent on Bitcoin', d: run ? <a href={mempoolTx(run.txid)} target="_blank" rel="noreferrer" className="mono">{short(run.txid, 8, 6)} <Icon name="external" size={11} /></a> : 'Waiting' },
    { t: `${conf} of ${need} confirmations`, d: p?.tx?.status.block_height ? `Block ${p.tx.status.block_height.toLocaleString('en-US')}` : run ? 'In the mempool' : '' },
    { t: 'Verified on NEAR', d: p?.transfer?.finalised ? <a href={nearblocksTx(p.transfer.finalised.transaction_hash)} target="_blank" rel="noreferrer" className="mono">verify_deposit_v2 · {short(p.transfer.finalised.transaction_hash, 6, 4)} <Icon name="external" size={11} /></a> : at >= 2 ? 'Relayer proving it to the light client…' : 'Merkle proof, light client' },
    { t: 'nBTC minted', d: p?.transfer?.finalised && run ? `${btc(Number(p.transfer.amount || run.sats) - fee)} nBTC · ${NBTC}` : '' },
  ];
  const done = (i: number) => i < at || (i === at && (i === 0 || stage === 'minted')) || (i === 1 && conf >= need);
  return <ol className="b5-steps">{steps.map((s, i) => <li key={s.t} className={done(i) ? 'done' : i === at || (i === at + 1 && i > 0 && done(i - 1)) ? 'now' : ''}><i>{done(i) ? <Icon name="check" size={14} /> : i + 1}</i><div><b>{s.t}</b><span>{s.d}</span></div></li>)}</ol>;
}

function DepositRow({ r }: { r: BridgeRun }) {
  const p = useLive<BridgeProgress>(`prog:${r.txid}`, () => bridgeProgress(r), 15000);
  const label = useMemo(() => ({ sent: 'In mempool', confirming: `${p.data?.confirmations} conf`, verifying: 'Verifying', minted: 'Minted', idle: '' } as const)[p.data?.stage || 'idle'], [p.data]);
  return <tr><td><a className="mono" href={mempoolTx(r.txid)} target="_blank" rel="noreferrer">{short(r.txid, 10, 6)} <Icon name="external" size={11} /></a></td><td className="tnum">{btc(r.sats)} tBTC</td>
    <td>{p.data?.transfer?.finalised ? <a className="mono" href={nearblocksTx(p.data.transfer.finalised.transaction_hash)} target="_blank" rel="noreferrer">{short(p.data.transfer.finalised.transaction_hash, 8, 4)} <Icon name="external" size={11} /></a> : '—'}</td>
    <td><span className={`c5-pill ${p.data?.stage === 'minted' ? 'ok' : ''}`}>{label || '…'}</span></td></tr>;
}
