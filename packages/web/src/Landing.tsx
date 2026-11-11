import { ActivityTable, VaultTable } from './cards';
import { useBoxes, useRounds, useTxns } from './data';
import { contractId, earnedSummary, nearblocksAccount, TUSDC_SYMBOL } from './lib';
import { Amount, Icon, Link, State, Term, TERMS } from './ui';
import { artSrc, CountUp, Wordmark } from './art';

export function SiteNav() {
  return <header className="l-nav">
    <Link to="/" aria-label="Otzar home"><Wordmark /></Link>
    <nav aria-label="Site"><Link to="/app">Vaults</Link><Link to="/how">How it works</Link></nav>
    <Link to="/app" className="pill pill-ink pill-sm">Open app</Link>
  </header>;
}

export function SiteFoot() {
  return <footer className="l-foot">
    <div className="l-foot-row">
      <Wordmark />
      <nav aria-label="Footer"><Link to="/app">Vaults</Link><Link to="/you">Portfolio</Link><Link to="/how">How it works</Link>{contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract <Icon name="external" size={12} /></a>}</nav>
    </div>
    <p className="l-foot-legal">A prototype on NEAR testnet, not a mainnet vault. {TUSDC_SYMBOL} is a test token with no value (deployed as “tUSDC (Hako test)”); Bitcoin runs on Core regtest; deposits from other chains are quotes only until NEAR_MAINNET_ACCOUNT is set. MIT · © 2026 Nivesh Gajengi</p>
  </footer>;
}

export default function Landing() {
  const rounds = useRounds(); const boxes = useBoxes(); const txns = useTxns();
  const sum = rounds.data ? earnedSummary(rounds.data) : null;

  return <>
    <SiteNav />
    <main id="main">
      <section className="s-hero">
        <div className="s-hero-copy">
          <h1>Earn on your Bitcoin.</h1>
          <p className="s-lede">Sell covered calls on BTC in a vault you own, and keep the premium buyers pay. Only your post-quantum key can move it.</p>
          <div className="s-hero-cta">
            <Link to="/app" className="pill pill-jade pill-lg">Open the app <Icon name="arrow" size={17} /></Link>
            <Link to="/how" className="s-textlink">How it works <Icon name="arrow" size={14} /></Link>
          </div>
        </div>
        <figure className="s-photo">
          {artSrc('otzar-hero') && <img src={artSrc('otzar-hero')!} alt="A carved jade vault holding gold coins" loading="eager" />}
          <aside className="s-proof" aria-label="Live from NEAR testnet" aria-live="polite">
            <p className="s-proof-top"><i className="live-dot" />Live on NEAR testnet</p>
            <b className="s-proof-num">{sum && sum.blended === null ? '—' : <CountUp value={sum?.blended ?? null} decimals={2} suffix="%" />}</b>
            <p className="s-proof-k"><Term tip={TERMS.apy}>Realised APY</Term></p>
            <p className="s-proof-line">{sum ? <><Amount e6={sum.earned} unit={TUSDC_SYMBOL} /> paid over {sum.paid.length} {sum.paid.length === 1 ? 'round' : 'rounds'}</> : rounds.error ? <span className="bad">{rounds.error}</span> : 'Reading the rounds…'}</p>
          </aside>
        </figure>
      </section>

      <section className="l-sec">
        <div className="s-sec-head"><h2>Vaults earning now</h2><Link to="/app" className="s-textlink">All vaults <Icon name="arrow" size={14} /></Link></div>
        {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults" action={<button className="pill pill-line pill-sm" onClick={() => { boxes.reload(); rounds.reload(); }}>Retry</button>}>{boxes.error}</State>
          : rounds.error && !rounds.data ? <State kind="error" title="Could not read the rounds" action={<button className="pill pill-line pill-sm" onClick={() => { boxes.reload(); rounds.reload(); }}>Retry</button>}>{rounds.error}</State>
          : !boxes.data || rounds.loading ? <div className="vt">{[0, 1, 2].map(i => <div key={i} className="vt-row skeleton" />)}</div>
          : <VaultTable boxes={boxes.data} rounds={rounds.data} account="" filter="rounds" limit={4} />}
      </section>

      <section className="l-sec s-oneline">
        <p>Deposit BTC. Offer it at a price above today’s. Keep the premium a buyer pays for that offer, whatever BTC does next.</p>
        <Link to="/how" className="s-textlink">How it works <Icon name="arrow" size={14} /></Link>
      </section>

      <section className="l-sec">
        <div className="s-sec-head"><h2>Latest on-chain activity</h2>{contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer" className="s-textlink">NearBlocks <Icon name="external" size={13} /></a>}</div>
        <ActivityTable txns={txns.data} error={txns.error} loading={txns.loading} limit={6} />
      </section>
    </main>
    <SiteFoot />
  </>;
}
