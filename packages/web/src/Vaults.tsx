import { useState } from 'react';
import { Card, Feed, Stat, v3art, VaultRows } from './blocks';
import { Spark } from './charts';
import { useBoxes, useRounds, useTusdc, useTxns } from './data';
import { useAsks, useBtcPrice, usd } from './live';
import { e6, earnedSummary, isPublicVault, roundPhase, short, TUSDC_SYMBOL } from './lib';
import { MintSheet } from './mint';
import { PageHead } from './shell';
import { CountUp } from './art';
import { Icon, Link, State } from './ui';
import type { Wallet } from './wallet';

export default function Vaults({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const txns = useTxns(25); const btc = useBtcPrice(); const bal = useTusdc(wallet.account);
  const [filter, setFilter] = useState<'earning' | 'public' | 'mine'>('earning');
  const [mint, setMint] = useState(false);
  const now = Date.now();
  const pub = boxes.data?.filter(b => isPublicVault(b.token_id)) || null;
  const pubRounds = rounds.data?.filter(r => isPublicVault(r.token_id)) || null;
  const sum = pubRounds ? earnedSummary(pubRounds) : null;
  const live = (rounds.data || []).filter(r => roundPhase(r, now).phase === 'live');
  const asks = useAsks(live.map(r => r.token_id));
  const locked = pub ? pub.filter(b => b.pq_key).length : 0;
  const mine = boxes.data?.filter(b => b.owner_id === wallet.account) || [];
  const count = (f: typeof filter) => !boxes.data ? '' : f === 'mine' ? mine.length : f === 'public' ? pub?.length : pub?.filter(b => pubRounds?.some(r => r.token_id === b.token_id)).length;

  return <div className="o-page">
    <PageHead title="Vaults" sub="Bitcoin vaults on NEAR. Each one is locked with a post-quantum key and can earn premium from covered calls."
      actions={<>{wallet.account && <button className="o-btn o-btn-line" onClick={() => setMint(true)}><Icon name="plus" size={15} /> New vault</button>}<Link to="/write" className="o-btn o-btn-ink">Write a call <Icon name="arrow" size={15} /></Link></>} />

    <section className="o-kpis" aria-label="Live numbers">
      <Stat live k="BTC-USD" v={btc.price ? usd(btc.price) : btc.error ? 'Unavailable' : '…'} sub={<Spark values={btc.history.map(h => h.price)} width={120} />} />
      <Stat k="Vaults" v={pub ? <CountUp value={pub.length} decimals={0} /> : '…'} sub={pub ? <span className="o-sub-ok"><Icon name="shield" size={12} /> {locked} quantum-locked</span> : 'Reading…'} />
      <Stat k="Premium paid" v={sum ? <>{e6(sum.earned.toString(), 4)} <small>{TUSDC_SYMBOL}</small></> : '…'} sub={sum ? `${sum.paid.length} paid rounds` : rounds.error || 'Reading…'} />
      <Stat live={live.length > 0} k="Open auctions" v={rounds.data ? live.length : '…'} sub={live.length ? <>Best ask {asks.data ? Object.values(asks.data).filter(Boolean).map(a => e6(a!, 4)).sort()[0] || '…' : '…'} {TUSDC_SYMBOL}</> : 'None open right now'} />
    </section>

    <div className="o-grid">
      <Card className="o-card-flush" title="All vaults" action={<div className="o-seg" role="tablist" aria-label="Filter vaults">{([['earning', 'Earning'], ['public', 'All'], ['mine', 'Yours']] as const).map(([f, l]) => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{l}<small>{count(f)}</small></button>)}</div>}>
        {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults" action={<button className="o-btn o-btn-line o-btn-sm" onClick={() => { boxes.reload(); rounds.reload(); }}>Retry</button>}>{boxes.error}</State>
          : !boxes.data ? <div className="o-table" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <div key={i} className="o-tr skeleton" />)}</div>
          : filter === 'mine' && !wallet.account ? <div className="o-empty"><img src={v3art('otzar-empty')} alt="" /><b>Connect to see your vaults</b><p>Browsing needs no wallet.</p><button className="o-btn o-btn-ink" onClick={wallet.connect} disabled={!wallet.ready}>Connect wallet</button></div>
          : <VaultRows boxes={boxes.data} rounds={rounds.data} account={wallet.account} filter={filter} asks={asks.data} />}
      </Card>
      <aside className="o-side">
        {wallet.account ? <Card className="o-card-jade" title="Your account">
          <p className="o-big tnum">{bal.data !== null ? e6(bal.data, 2) : '…'} <small>{TUSDC_SYMBOL}</small></p>
          <p className="o-mute">{short(wallet.account, 14, 8)} · {mine.length} {mine.length === 1 ? 'vault' : 'vaults'}, {mine.filter(b => b.pq_key).length} locked</p>
          <div className="o-row"><Link to="/positions" className="o-btn o-btn-light o-btn-sm">Positions</Link><button className="o-btn o-btn-gold o-btn-sm" onClick={() => setMint(true)}><Icon name="plus" size={14} /> New vault</button></div>
        </Card> : <Card className="o-card-jade" title="Start earning">
          <p className="o-mute">Connect a NEAR testnet wallet to mint a vault, lock it with your post-quantum key and write calls.</p>
          <button className="o-btn o-btn-gold" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={15} /> Connect wallet</button>
        </Card>}
        <Card title={<><i className="o-live" aria-hidden="true" />Live activity</>} action={<Link to="/activity" className="o-link">All <Icon name="arrow" size={13} /></Link>}>
          <Feed txns={txns.data} error={txns.error} loading={txns.loading} limit={6} dense />
        </Card>
      </aside>
    </div>
    {mint && <MintSheet wallet={wallet} onClose={() => setMint(false)} />}
  </div>;
}
