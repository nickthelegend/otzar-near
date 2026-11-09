import { useState } from 'react';
import { useBoxes, useNow, useRelayer, useRounds, useTxns } from './data';
import { ago, btcFromSats, e6, earnedSummary, TUSDC_SYMBOL } from './lib';
import { ActivityTable, PositionCard, RoundBars, StatCard, VaultTable, type VaultFilter } from './cards';
import { MintSheet } from './mint';
import { RoundSheet } from './RoundSheet';
import { pct } from './rounds';
import { Amount, Glow, Icon, State } from './ui';
import type { Wallet } from './wallet';

export function RelayerCard() {
  const relayer = useRelayer(); const now = useNow(10000); const p = relayer.data;
  return <section className="card relayer" aria-label="Settlement price">
    <div className="card-title"><h2>Settlement price</h2><span className="tag">relayer price (testnet)</span></div>
    {p ? <>
      <p className="relayer-px">${e6(p.price_usd_e6, 2)}</p>
      <p className="relayer-meta">BTC-USD · Coinbase last trade · {ago(p.publish_time_sec * 1e9, now)}</p>
      <p className="relayer-src">Signed by the Hako relayer key and checked on-chain by <code>post_relayer_price</code> before a round can settle.</p>
    </> : relayer.error ? <p className="err-line">{relayer.error}</p> : relayer.loading ? <p className="relayer-meta"><i className="pulse" /> Reading…</p> : <p className="relayer-meta">No price posted yet.</p>}
  </section>;
}

export default function Dashboard({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const txns = useTxns();
  const [filter, setFilter] = useState<VaultFilter>('rounds');
  const [mint, setMint] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const s = rounds.data ? earnedSummary(rounds.data) : null;
  const written = s ? s.paid.reduce((a, c) => a + Number(c.size_sats), 0) : null;
  const sealed = boxes.data?.filter(b => b.pq_key?.length).length;
  const count = (f: VaultFilter) => (boxes.data || []).filter(b => f === 'all' || (f === 'mine' ? b.owner_id === wallet.account : rounds.data?.some(r => r.token_id === b.token_id))).length;
  const open = rounds.data?.find(r => `${r.token_id}#${r.id}` === sheet);

  return <div className="page dash">
    <header className="dash-head">
      <div>
        <p className="lbl">Hako · BTC covered-call vaults</p>
        <h1>Vaults <span className="live-pill"><i className="live-dot" />Live · NEAR testnet</span></h1>
        <p className="dash-sub">Each vault is a NEAR NFT holding native Bitcoin. Its owner sells covered calls on it and keeps the premium, signed with a post-quantum key.</p>
      </div>
      <button className="pill pill-ice" onClick={() => setMint(true)}><Icon name="plus" size={16} /> New vault</button>
      <Glow name="vault" className="dash-glow" />
    </header>

    <div className="stats4">
      <StatCard highlight label="Premium earned" icon="coin" value={s ? <Amount e6={s.earned} unit={TUSDC_SYMBOL} /> : rounds.error ? '—' : '…'} sub={s ? `paid to writers across ${s.paid.length} rounds` : rounds.error || 'Reading rounds…'} />
      <StatCard label="Realised APY" icon="spark" value={s ? <span className="ice">{pct(s.blended, 2)}</span> : '…'} sub="annualised on strike notional" />
      <StatCard label="BTC written" icon="box" value={written !== null ? <>{btcFromSats(written)}<small> BTC</small></> : '…'} sub="collateral sold in paid rounds · regtest" />
      <StatCard label="Vaults" icon="key" value={boxes.data ? boxes.data.length : boxes.error ? '—' : '…'} sub={sealed !== undefined ? `${sealed} sealed with ML-DSA-65` : boxes.error || 'Reading…'} />
    </div>

    <div className="dash-grid">
      <div className="dash-main">
      <section className="card vaults-card" aria-label="Vaults">
        <div className="card-title">
          <div><h2>Covered-call vaults</h2><p>Sorted by realised APY. Open one to see its current round, strategy and deposit address.</p></div>
          <div className="filters" role="tablist" aria-label="Filter vaults">{([['rounds', 'With rounds'], ['all', 'All'], ['mine', 'Yours']] as const).map(([f, l]) => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{l}<small>{boxes.data ? count(f) : ''}</small></button>)}</div>
        </div>
        {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults" action={<button className="pill pill-ghost pill-sm" onClick={boxes.reload}>Retry</button>}>{boxes.error}</State>
          : !boxes.data ? <div className="vt">{[0, 1, 2, 3].map(i => <div key={i} className="vt-row skeleton" />)}</div>
          : <VaultTable boxes={boxes.data} rounds={rounds.data} account={wallet.account} filter={filter} />}
      </section>
    <section className="card act-card" aria-label="Activity">
      <div className="card-title"><div><h2>Activity</h2><p>Transactions to the vault contract, from NearBlocks.</p></div></div>
      <ActivityTable txns={txns.data} error={txns.error} loading={txns.loading} />
    </section>
      </div>
      <aside className="dash-rail">
        <PositionCard wallet={wallet} rounds={rounds.data} />
        <section className="card" aria-label="APY by round">
          <div className="card-title"><h2>APY by round</h2><span className="dim small">tap a bar</span></div>
          {rounds.data && rounds.data.length ? <RoundBars rounds={rounds.data} onPick={k => setSheet(k)} /> : rounds.error ? <p className="err-line">{rounds.error}</p> : <p className="dim small">{rounds.data ? 'No rounds yet.' : 'Reading rounds…'}</p>}
        </section>
        <RelayerCard />
      </aside>
    </div>


    {mint && <MintSheet wallet={wallet} onClose={() => setMint(false)} />}
    {open && <RoundSheet r={open} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
