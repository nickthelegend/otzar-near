import { useState } from 'react';
import { Feed, Stat, v3art, VaultRows } from './blocks';
import { PriceChart } from './charts';
import { useBoxes, useLive, useRounds, useTxns, view } from './data';
import { NBTC } from './bridge';
import { BtcTicker } from './shell';
import { useBtcPrice, useCandles, usd } from './live';
import { contractId, e6, earnedSummary, isPublicVault, nearblocksAccount, TUSDC_SYMBOL } from './lib';
import { CountUp, Wordmark } from './art';
import { Icon, Link } from './ui';

export function SiteNav({ dark = false }: { dark?: boolean }) {
  return <header className={`l3-nav ${dark ? 'l3-nav-dark' : ''}`}>
    <Link to="/" aria-label="Otzar home" className="l3-logo"><Wordmark /></Link>
    <nav aria-label="Site"><Link to="/app">Vault</Link><Link to="/bridge">Bridge</Link><Link to="/market">Buy calls</Link><Link to="/security">Security</Link><a href="#faq">FAQ</a></nav>
    <div className="l3-nav-end"><BtcTicker /><Link to="/app" className="o-btn o-btn-ink">Launch app</Link></div>
  </header>;
}

export function SiteFoot() {
  return <footer className="l3-foot">
    <div className="l3-foot-top">
      <div className="l3-foot-brand"><Wordmark /><p>The quantum-safe Bitcoin vault that earns. Built on NEAR.</p></div>
      <nav aria-label="Product"><b>Product</b><Link to="/app">Vaults</Link><Link to="/market">Buy calls</Link><Link to="/write">Write a call</Link><Link to="/positions">Positions</Link></nav>
      <nav aria-label="Security"><b>Security</b><Link to="/security">Quantum security</Link><Link to="/activity">On-chain activity</Link>{contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract on NearBlocks</a>}</nav>
      <nav aria-label="Learn"><b>Learn</b><Link to="/how">How it works</Link><a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noreferrer">FIPS 204 (ML-DSA)</a><a href="https://docs.near.org/chain-abstraction/chain-signatures" target="_blank" rel="noreferrer">NEAR Chain Signatures</a></nav>
    </div>
    <p className="l3-foot-legal">A working prototype on NEAR testnet, not a mainnet vault. {TUSDC_SYMBOL} is a test token with no value; BTC arrives from Bitcoin testnet through the Omni bridge as nBTC. Formerly Hako, so on-chain names keep that prefix. MIT · © 2026 Nivesh Gajengi</p>
  </footer>;
}

const FAQ: [string, string][] = [
  ['How does the yield work?', 'You sell someone the right to buy your BTC at a higher price later (a covered call). They pay you a premium now. You keep it whatever happens; if BTC ends above that price, you sell at it.'],
  ['Does bridged BTC earn too?', 'Yes, the same way. Once your nBTC is locked in a vault, it backs the calls you sell. The bridge itself pays no yield.'],
  ['What does quantum-safe mean?', 'Every move from your vault needs an ML-DSA-65 signature (NIST FIPS 204) as well as your normal key. NEAR checks it inside the contract. A quantum computer that breaks normal keys still cannot forge it.'],
  ['How does the bridge work?', 'You send testnet BTC to an address made just for your NEAR account. NEAR’s Bitcoin light client checks the proof, then the Omni connector mints the same amount of nBTC to you.'],
  ['What is still classical?', 'Bitcoin’s own signatures, the bridge’s MPC key and NEAR account keys. Otzar makes the vault’s authority quantum-safe, and says so.'],
];

export default function Landing() {
  const rounds = useRounds(); const boxes = useBoxes(); const txns = useTxns(12);
  const btc = useBtcPrice(); const candles = useCandles(3600);
  const lockedSats = useLive<string>(contractId ? 'nbtc:contract' : null, () => view<string>(NBTC, 'ft_balance_of', { account_id: contractId }), 15000);
  const [open, setOpen] = useState(0);
  const pub = boxes.data?.filter(b => isPublicVault(b.token_id)) || null;
  const pubRounds = rounds.data?.filter(r => isPublicVault(r.token_id)) || null;
  const sum = pubRounds ? earnedSummary(pubRounds) : null;
  const locked = pub ? pub.filter(b => b.pq_key).length : null;
  const latest = pubRounds?.[0];

  return <>
    <section className="l3-hero" style={{ backgroundImage: `url(${v3art('otzar-hero')})` }}>
      <SiteNav />
      <div className="l3-hero-copy">
        <span className="l3-badge"><Icon name="shield" size={14} />Live on NEAR testnet</span>
        <h1>Quantum&#8209;safe Bitcoin that earns.</h1>
        <p className="l3-lede">Bridge BTC to NEAR, lock it in a vault only your quantum-safe key can open, and earn premium while it waits.</p>
        <div className="l3-cta"><Link to="/bridge" className="o-btn o-btn-ink o-btn-lg">Bridge BTC <Icon name="arrow" size={17} /></Link><Link to="/app" className="o-btn o-btn-line o-btn-lg">Open your vault</Link></div>
      </div>
    </section>

    <main id="main">
      <section className="l3-stats" aria-label="Live numbers">
        <Stat live k="BTC-USD" v={btc.price ? usd(btc.price) : '…'} sub="Coinbase, live" />
        <Stat live k="Bridged BTC locked" v={lockedSats.data !== null ? `${(Number(lockedSats.data) / 1e8).toFixed(5)} BTC` : '…'} sub="nBTC held by the vault contract" />
        <Stat live k="Vaults on NEAR" v={pub ? <CountUp value={pub.length} decimals={0} /> : '…'} sub={locked !== null && pub ? `${locked} quantum-locked` : 'Reading the contract'} />
        <Stat live k="Premium paid to owners" v={sum ? <>{e6(sum.earned.toString(), 4)} <small>{TUSDC_SYMBOL}</small></> : '…'} sub={sum ? `${sum.paid.length} calls sold` : 'Reading'} />
              </section>

      <section className="l3-pq" id="quantum">
        <div className="l3-pq-grid">
          <figure className="l3-pq-art"><img src={v3art('otzar-vault-lock')} alt="A jade vault with a gold dial and a second, lattice-patterned padlock" /></figure>
          <div className="l3-pq-copy">
            <h2>Two locks on every vault. One is quantum&#8209;safe.</h2>
            <p>Your normal key could be forged by a future quantum computer. Every move from an Otzar vault also needs an <b>ML-DSA-65</b> signature, and NEAR checks it inside the contract.</p>
            <Link to="/security" className="o-btn o-btn-gold">Try to break it <Icon name="arrow" size={15} /></Link>
          </div>
        </div>
      </section>

      <section className="l3-sec" id="how">
        <div className="l3-sec-head"><h2>Four steps. Real BTC.</h2></div>
        <div className="l3-steps l3-steps-4">
          <article><img src={v3art('otzar-yield-stream')} alt="Gold coins flowing into a jade bowl" /><span className="l3-n">1</span><h3>Bridge</h3><p>Send testnet BTC. Get nBTC on NEAR.</p></article>
          <article><img src={v3art('otzar-vault-lock')} alt="A jade vault with a lattice padlock" /><span className="l3-n">2</span><h3>Lock</h3><p>Into a vault only your quantum-safe key can open.</p></article>
          <article><img src={v3art('otzar-strike-dial')} alt="A jade and gold strike dial" /><span className="l3-n">3</span><h3>Earn</h3><p>Sell covered calls. The premium is your yield.</p></article>
          <article><img src={v3art('otzar-key')} alt="A jade key with a gold bow" /><span className="l3-n">4</span><h3>Withdraw</h3><p>Sign with both keys. Nothing else opens it.</p></article>
        </div>
      </section>

      <section className="l3-sec">
        <div className="l3-sec-head"><h2>How the vault earns</h2><p className="l3-sub">Buyers pay you now for the right to buy your BTC at a higher price later. That premium is the yield.</p></div>
        <div className="l3-market">
          <div className="o-card l3-chart">
            <header className="o-card-h"><div><h3>BTC-USD</h3><p className="dim small">Latest strike in gold</p></div><BtcTicker /></header>
            <PriceChart candles={candles.data?.slice(-288) || null} live={btc.price} levels={latest ? [{ value: Number(latest.strike_usd_e6) / 1e6, label: 'Last strike', tone: 'gold' }] : []} height={260} />
          </div>
          <div className="o-card l3-vaults">{boxes.data && pub ? <VaultRows boxes={pub} rounds={rounds.data} filter="earning" limit={5} /> : <div className="o-table" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="o-tr skeleton" />)}</div>}</div>
        </div>
      </section>

      <section className="l3-sec l3-trust">
        <div className="l3-trust-feed o-card">
          <header className="o-card-h"><h3><i className="o-live" aria-hidden="true" />Latest on chain</h3>{contractId && <a className="l3-link" href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">NearBlocks <Icon name="external" size={13} /></a>}</header>
          <Feed txns={txns.data} error={txns.error} loading={txns.loading} limit={7} />
        </div>
        <div className="l3-trust-facts">
          <h2>Proof you can check.</h2>
          <ul>
            <li><b>Bridge</b><span>Omni BTC connector, verified by NEAR’s Bitcoin light client</span></li>
            <li><b>Contract</b><span>{contractId}</span></li>
            <li><b>Attacks refused on chain</b><span>NEAR key alone, forged signature, wrong key, replay</span></li>
          </ul>
          <Link to="/security" className="o-btn o-btn-jade">Open the security page <Icon name="arrow" size={15} /></Link>
        </div>
      </section>

      <section className="l3-faq" id="faq">
        <h2>Questions</h2>
        <div className="l3-faq-list">{FAQ.map(([q, a], i) => <div key={q} className={`l3-q ${open === i ? 'open' : ''}`}><button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{q}<Icon name={open === i ? 'x' : 'plus'} size={18} /></button>{open === i && <p>{a}</p>}</div>)}</div>
      </section>

      <section className="l3-close">
        <img src={v3art('otzar-og')} alt="" />
        <div><h2>Bridge it. Lock it. Sleep through Q-day.</h2><Link to="/bridge" className="o-btn o-btn-ink o-btn-lg">Launch app <Icon name="arrow" size={17} /></Link></div>
      </section>
    </main>
    <SiteFoot />
  </>;
}
