import { useState } from 'react';
import { AttackerPanel, Feed, Stat, v3art, VaultRows } from './blocks';
import { PriceChart } from './charts';
import { useBoxes, useRounds, useTxns } from './data';
import { BtcTicker } from './shell';
import { useBtcPrice, useCandles, usd } from './live';
import { contractId, e6, earnedSummary, isPublicVault, nearblocksAccount, TUSDC_SYMBOL } from './lib';
import { CountUp, Wordmark } from './art';
import { Icon, Link } from './ui';

export function SiteNav({ dark = false }: { dark?: boolean }) {
  return <header className={`l3-nav ${dark ? 'l3-nav-dark' : ''}`}>
    <Link to="/" aria-label="Otzar home" className="l3-logo"><Wordmark /></Link>
    <nav aria-label="Site"><Link to="/app">Vaults</Link><Link to="/security">Security</Link><Link to="/how">How it works</Link><a href="#faq">FAQ</a></nav>
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
    <p className="l3-foot-legal">A working prototype on NEAR testnet, not a mainnet vault. {TUSDC_SYMBOL} is a test token with no value; Bitcoin runs on Bitcoin Core regtest. Formerly Hako, so on-chain names keep that prefix. MIT · © 2026 Nivesh Gajengi</p>
  </footer>;
}

const FAQ: [string, string][] = [
  ['What does quantum-safe mean here?', 'Your vault is controlled by an ML-DSA-65 key, the post-quantum signature NIST standardised as FIPS 204. NEAR checks that signature inside the Otzar contract before any spend, transfer, listing, rule change or covered call. A quantum computer that can break today’s elliptic-curve keys still cannot produce it.'],
  ['Where does the yield come from?', 'From buyers. You offer to sell your BTC at a price above today’s (the strike) until a date. A buyer pays you a premium for that right. You keep it whatever happens. If BTC ends above the strike, the buyer can buy your BTC at the strike, so you give up gains above it.'],
  ['Who holds my Bitcoin?', 'Your vault does. Each vault is an NFT on NEAR that controls its own Bitcoin address through NEAR Chain Signatures. Nobody can request a signature for it without your keys and the vault’s rules.'],
  ['What is still classical?', 'Bitcoin’s own ECDSA signature once a transaction is broadcast, NEAR’s MPC root key, and the contract account’s ed25519 deploy key. We list each one on the Security page instead of hiding it.'],
  ['Is this live?', 'Yes, on NEAR testnet. Every number on this page is read from the chain or from Coinbase as you watch. Premiums are paid in tUSDC, a no-value test token, and Bitcoin runs on a local regtest node.'],
];

export default function Landing() {
  const rounds = useRounds(); const boxes = useBoxes(); const txns = useTxns(12);
  const btc = useBtcPrice(); const candles = useCandles(3600);
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
        <span className="l3-badge"><Icon name="shield" size={14} />Post-quantum ML-DSA-65 · live on NEAR testnet</span>
        <h1>A Bitcoin vault only your quantum&#8209;safe key can move.</h1>
        <p className="l3-lede">…and it earns covered-call premium while it waits.</p>
        <div className="l3-cta"><Link to="/app" className="o-btn o-btn-ink o-btn-lg">Launch app <Icon name="arrow" size={17} /></Link><Link to="/security" className="o-btn o-btn-line o-btn-lg"><Icon name="shield" size={16} /> See the security</Link></div>
        <p className="l3-edge"><b>Where the guarantee stops:</b> NEAR checks your post-quantum signature before anything moves. Bitcoin’s own signature and NEAR’s signing network are still classical, and we say so.</p>
      </div>
    </section>

    <main id="main">
      <section className="l3-stats" aria-label="Live numbers">
        <Stat live k="BTC-USD, Coinbase" v={btc.price ? usd(btc.price) : '…'} sub="Refreshed every 4 seconds" />
        <Stat live k="Vaults on NEAR" v={pub ? <CountUp value={pub.length} decimals={0} /> : '…'} sub={locked !== null && pub ? `${locked} locked with ML-DSA-65` : 'Reading the contract'} />
        <Stat live k="Premium paid to owners" v={sum ? <>{e6(sum.earned.toString(), 4)} <small>{TUSDC_SYMBOL}</small></> : '…'} sub={sum ? `Across ${sum.paid.length} paid rounds` : 'Reading rounds'} />
        <Stat live k="Rounds written" v={pubRounds ? <CountUp value={pubRounds.length} decimals={0} /> : '…'} sub="Each one signed with ML-DSA" />
      </section>

      <section className="l3-pq" id="quantum">
        <div className="l3-pq-grid">
          <figure className="l3-pq-art"><img src={v3art('otzar-vault-lock')} alt="A jade vault with a gold dial and a second, lattice-patterned padlock" /></figure>
          <div className="l3-pq-copy">
            <h2>Two locks on every vault. One of them is quantum&#8209;safe.</h2>
            <p>Most crypto is protected by elliptic-curve keys. A large enough quantum computer could work out a private key from its public key, and every Bitcoin address that has ever spent shows its public key.</p>
            <p>Otzar adds a second lock: <b>ML-DSA-65</b>, the lattice-based signature NIST standardised in 2024. The Otzar contract checks it on NEAR with <code>env::ml_dsa_verify</code> before your Bitcoin, your vault or your rules can change.</p>
            <ol className="l3-pq-steps">
              <li><span><b>Your key, made in your browser.</b> A 1,952-byte public key goes on chain; the secret never leaves your file.</span></li>
              <li><span><b>Every action signed.</b> Spend, transfer, list, write a call, change a rule: each needs that signature and a fresh nonce.</span></li>
              <li><span><b>Checked by the contract.</b> NEAR refuses a missing, forged or replayed signature. The rejections are on chain.</span></li>
            </ol>
          </div>
        </div>
        <AttackerPanel dark />
      </section>

      <section className="l3-sec" id="how">
        <div className="l3-sec-head"><h2>Earn on Bitcoin you never hand over.</h2><Link to="/how" className="l3-link">How covered calls work <Icon name="arrow" size={14} /></Link></div>
        <div className="l3-steps">
          <article><img src={v3art('otzar-key')} alt="A jade key with a gold lattice bow" /><span className="l3-n">1</span><h3>Lock a vault</h3><p>Mint a vault NFT on NEAR, register your post-quantum key and send BTC to its own address.</p></article>
          <article><img src={v3art('otzar-strike-dial')} alt="A jade and gold dial with a raised pointer" /><span className="l3-n">2</span><h3>Pick a strike</h3><p>Offer your BTC at a price above today’s, for a few hours or days. You sign the terms with your ML-DSA key.</p></article>
          <article><img src={v3art('otzar-yield-stream')} alt="Gold coins rising from a jade bowl" /><span className="l3-n">3</span><h3>Keep the premium</h3><p>A buyer pays a premium straight to you on NEAR. It is yours whatever BTC does next.</p></article>
        </div>
      </section>

      <section className="l3-sec">
        <div className="l3-sec-head"><h2>Vaults earning now</h2><Link to="/app" className="l3-link">All vaults <Icon name="arrow" size={14} /></Link></div>
        <div className="l3-market">
          <div className="o-card l3-chart">
            <header className="o-card-h"><div><h3>BTC-USD, last 12 days</h3><p className="dim small">Coinbase hourly candles · latest strike in gold</p></div><BtcTicker /></header>
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
            <li><b>Open contract on NEAR testnet</b><span>{contractId}</span></li>
            <li><b>85 real-chain test transactions</b><span>55 vault and 30 covered-call transactions on a local NEAR node, 34 of them attacks the contract refuses, plus 11 unit tests</span></li>
            <li><b>Live attacks refused</b><span>Classical-key transfer, forged ML-DSA, wrong-key spend, replayed nonce, early recovery</span></li>
            <li><b>Bitcoin signed by NEAR</b><span>Chain Signatures MPC signs each withdrawal after the contract’s checks</span></li>
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
        <div><h2>Lock it. Earn on it. Sleep through Q-day.</h2><Link to="/app" className="o-btn o-btn-ink o-btn-lg">Launch app <Icon name="arrow" size={17} /></Link></div>
      </section>
    </main>
    <SiteFoot />
  </>;
}
