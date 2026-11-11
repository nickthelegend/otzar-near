import { useState } from 'react';
import { useBoxes, useRounds, useTusdc } from './data';
import { earnedSummary, short, TUSDC_SYMBOL } from './lib';
import { RoundBars, VaultTable, type VaultFilter } from './cards';
import { MintSheet } from './mint';
import { RoundSheet } from './RoundSheet';
import { Amount, Icon, Link, State, Term, TERMS } from './ui';
import { CountUp } from './art';
import type { Wallet } from './wallet';

/** The one action widget beside the vault list: connect, or your balance with a way to mint. */
function StartCard({ wallet, onMint }: { wallet: Wallet; onMint: () => void }) {
  const bal = useTusdc(wallet.account); const boxes = useBoxes(); const rounds = useRounds();
  const owned = boxes.data?.filter(b => b.owner_id === wallet.account).length;
  const earned = rounds.data ? earnedSummary(rounds.data.filter(r => r.writer === wallet.account)).earned : null;
  if (!wallet.account) return <aside className="s-widget" aria-label="Get started">
    <h2>Connect a NEAR testnet wallet</h2>
    <p>To mint a vault and write rounds. Browsing needs no wallet.</p>
    <button className="pill pill-gold pill-block" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect wallet</button>
    <p className="s-widget-note">Connects with Meteor Wallet. A testnet account is free at wallet.meteorwallet.app.</p>
  </aside>;
  return <aside className="s-widget" aria-label="Your position">
    <p className="s-widget-k">Your {TUSDC_SYMBOL} <span className="mono">{short(wallet.account, 12, 6)}</span></p>
    <p className="s-widget-big">{bal.data !== null ? <Amount e6={bal.data} /> : bal.error ? <span className="dim" title={bal.error}>Unavailable</span> : '…'}</p>
    <dl className="s-widget-kv">
      <div><dt>Vaults you own</dt><dd>{owned ?? '…'}</dd></div>
      <div><dt>Premium you earned</dt><dd>{earned !== null ? <Amount e6={earned} /> : '…'}</dd></div>
    </dl>
    <button className="pill pill-gold pill-block" onClick={onMint}><Icon name="plus" size={16} /> New vault</button>
    <Link to="/you" className="s-textlink s-textlink-light">Your portfolio <Icon name="arrow" size={14} /></Link>
  </aside>;
}

export default function Dashboard({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds();
  const [filter, setFilter] = useState<VaultFilter>('rounds');
  const [mint, setMint] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const s = rounds.data ? earnedSummary(rounds.data) : null;
  const count = (f: VaultFilter) => (boxes.data || []).filter(b => f === 'all' || (f === 'mine' ? b.owner_id === wallet.account : rounds.data?.some(r => r.token_id === b.token_id))).length;
  const open = rounds.data?.find(r => `${r.token_id}#${r.id}` === sheet);

  return <div className="page s-app">
    <header className="s-page-head">
      <div><h1>Vaults</h1><p>Each vault holds Bitcoin and sells covered calls on it.</p></div>
      {wallet.account && <button className="pill pill-line pill-sm" onClick={() => setMint(true)}><Icon name="plus" size={15} /> New vault</button>}
    </header>

    <div className="s-top">
      <section className="s-summary" aria-label="What Otzar vaults earned">
        <div className="s-summary-num">
          <p className="s-k"><Term tip={TERMS.apy}>Realised APY</Term>, all vaults</p>
          <b className="gold-num">{s && s.blended === null ? '—' : <CountUp value={s ? s.blended : null} decimals={2} suffix="%" />}</b>
          <p className="s-summary-line">{s ? <><Amount e6={s.earned} unit={TUSDC_SYMBOL} /> premium paid over {s.paid.length} {s.paid.length === 1 ? 'round' : 'rounds'} · {boxes.data ? `${boxes.data.length} vaults` : '…'}</> : rounds.error ? <span className="bad">{rounds.error}</span> : 'Reading the rounds…'}</p>
        </div>
        <div className="s-summary-chart">
          {rounds.data && rounds.data.length ? <RoundBars rounds={rounds.data} height={132} onPick={k => setSheet(k)} /> : <p className="dim small">{rounds.error || (rounds.data ? 'No rounds yet.' : 'Reading rounds…')}</p>}
        </div>
      </section>
      <StartCard wallet={wallet} onMint={() => setMint(true)} />
    </div>

    <section className="card s-list" aria-label="Vaults">
      <div className="s-list-head">
        <h2>{filter === 'rounds' ? 'Earning vaults' : filter === 'mine' ? 'Your vaults' : 'All vaults'}</h2>
        <div className="filters" role="tablist" aria-label="Filter vaults">{([['rounds', 'Earning'], ['all', 'All'], ['mine', 'Yours']] as const).map(([f, l]) => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{l}<small>{boxes.data ? count(f) : ''}</small></button>)}</div>
      </div>
      {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults" action={<button className="pill pill-line pill-sm" onClick={boxes.reload}>Retry</button>}>{boxes.error}</State>
        : !boxes.data ? <div className="vt">{[0, 1, 2, 3].map(i => <div key={i} className="vt-row skeleton" />)}</div>
        : <VaultTable boxes={boxes.data} rounds={rounds.data} account={wallet.account} filter={filter} />}
    </section>

    {mint && <MintSheet wallet={wallet} onClose={() => setMint(false)} />}
    {open && <RoundSheet r={open} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
