import { useState } from 'react';
import PortfolioTotals from './PortfolioTotals';
import { ActivityTable, PhasePill, VaultTable } from './cards';
import { RoundSheet } from './RoundSheet';
import { useBoxes, useNow, useRounds, useTusdc, useTxns } from './data';
import { anvilUrl, btcFromSats, contractId, earnedSummary, esploraUrl, nearblocksAccount, roundYieldLabel, short, summaryYieldLabel, TUSDC_SYMBOL, utcDay, type Round } from './lib';
import { pct } from './rounds';
import { Amount, Icon, Link, State, Term, TERMS } from './ui';
import { Obj } from './art';
import type { Wallet } from './wallet';

export default function Portfolio({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const txns = useTxns(); const now = useNow(15000);
  const bal = useTusdc(wallet.account);
  const [sheet, setSheet] = useState<Round | null>(null);
  const acct = wallet.account;
  const mine = (boxes.data || []).filter(b => b.owner_id === acct);
  const myRounds = (rounds.data || []).filter(r => r.writer === acct || r.holder === acct);
  const wrote = earnedSummary(myRounds.filter(r => r.writer === acct));
  const myTx = txns.data ? txns.data.filter(t => t.signer === acct) : null;

  if (!acct) return <div className="page s-app">
    <section className="s-connect">
      <div className="s-connect-art"><Obj name="nft-card" size={260} float alt="A jade vault card with a gold dial: each vault is an NFT you own" /></div>
      <div>
        <h1>Your vaults and what they earned.</h1>
        <p>Connect a NEAR testnet wallet to see the vaults you own, your rounds and your {TUSDC_SYMBOL} balance.</p>
        <button className="pill pill-jade pill-lg" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={17} /> Connect wallet</button>
      </div>
    </section>
  </div>;

  return <div className="page s-app">
    <section className="s-balance" aria-label="Your balance">
      <div className="s-balance-top"><p className="s-k">Your <Term tip={TERMS.tusdc}>{TUSDC_SYMBOL}</Term> balance</p><a href={nearblocksAccount(acct)} target="_blank" rel="noreferrer" className="mono s-acct">{short(acct, 16, 8)} <Icon name="external" size={12} /></a></div>
      <p className="s-balance-big">{bal.data !== null ? <Amount e6={bal.data} unit={TUSDC_SYMBOL} /> : bal.error ? <span className="dim" title={bal.error}>Unavailable</span> : '…'}</p>
      <dl className="s-balance-kv">
        <div><dt><Term tip={TERMS.premium}>Premium earned</Term></dt><dd>{rounds.data ? <Amount e6={wrote.earned} /> : '…'}</dd></div>
        <div><dt><Term tip={TERMS.apy}>{summaryYieldLabel(wrote)}</Term></dt><dd>{pct(wrote.blended, 2)}</dd></div>
        <div><dt>Vaults</dt><dd>{boxes.data ? mine.length : '…'}</dd></div>
      </dl>
      <button className="pill pill-line pill-sm s-signout" onClick={wallet.disconnect}>Sign out</button>
    </section>

    <section className="card s-list">
      <div className="s-list-head"><h2>Your vaults</h2></div>
      {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults">{boxes.error}</State> : boxes.data ? <VaultTable boxes={boxes.data} rounds={rounds.data} account={acct} filter="mine" /> : <div className="vt-row skeleton" />}
      <PortfolioTotals boxes={boxes.data || []} account={acct} contractId={contractId} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
    </section>

    <section className="card s-list">
      <div className="s-list-head"><h2>Your rounds</h2></div>
      {myRounds.length ? <div className="rt" role="table">
        <div className="rt-head" role="row"><span>Round</span><span>You were</span><span>Strike</span><span>Premium</span><span>APY</span><span>Outcome</span></div>
        {myRounds.map(r => <button key={r.key} className="rt-row" onClick={() => setSheet(r)}>
          <span><b>#{r.id} {short(r.token_id, 12, 6)}</b><small>{utcDay(r.opened_ns)} · {btcFromSats(r.size_sats)} BTC</small></span>
          <span data-label="You were">{r.writer === acct ? 'Seller' : 'Buyer'}</span>
          <span data-label="Strike" className="mono">${(Number(r.strike_usd_e6) / 1e6).toLocaleString()}</span>
          <span data-label="Premium">{r.premium_paid_usdc ? <Amount e6={r.premium_paid_usdc} /> : <span className="dim">—</span>}</span>
          <span data-label="APY" className="jade">{roundYieldLabel(r)}</span>
          <span data-label="Outcome"><PhasePill c={r} now={now} plain /></span>
        </button>)}
      </div> : <State kind="empty" title={rounds.data ? 'No rounds with your account yet' : 'Reading rounds…'}>Write a round from one of your vaults, or buy an open one from a vault page.</State>}
    </section>

    <section className="card s-list">
      <div className="s-list-head"><h2>Your activity</h2></div>
      <ActivityTable txns={myTx} error={txns.error} loading={txns.loading} />
    </section>

    <p className="s-footnote"><Link to="/how#safety">How your vault is kept safe</Link></p>
    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
