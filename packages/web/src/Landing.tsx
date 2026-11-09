import { rootPublicKey, TESTNET_MPC } from '@hako/sdk';
import ExposureScanner from './ExposureScanner';
import Safety from './safety';
import { ActivityTable, PhasePill, StrikeSpot } from './cards';
import { useBoxes, useLive, useNow, useRelayer, useRounds, useTxns } from './data';
import { ago, annualisedPct, anvilUrl, btcFromSats, contractId, e6, earnedSummary, esploraUrl, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, utcDay, utcTime } from './lib';
import { evidenceMeta, pct } from './rounds';
import { Amount, Icon, Link } from './ui';
import { Art, artSrc, CountUp, Sticker, Wordmark } from './art';
import LiveTape, { ApyChip } from './tape';

export default function Landing() {
  const rounds = useRounds(); const boxes = useBoxes(); const relayer = useRelayer(); const txns = useTxns();
  const mpc = useLive<string>('mpc-root', () => rootPublicKey() as Promise<string>, 600000);
  const now = useNow(10000);
  const sum = rounds.data ? earnedSummary(rounds.data) : null;
  const sealed = boxes.data?.filter(b => b.pq_key?.length).length;
  const lead = rounds.data?.find(r => r.premium_paid_usdc && roundPhase(r, now).phase === 'itm') || rounds.data?.find(r => r.premium_paid_usdc) || rounds.data?.[0];
  const dash = (v: unknown, err: string) => (v === null || v === undefined ? (err ? '—' : '…') : null);

  return <>
    {sum && sum.paid.length > 0 && <a className="announce" href="#record"><span className="announce-tag">Live</span><span>The covered-call loop on NEAR testnet has paid <b><Amount e6={sum.earned} unit={TUSDC_SYMBOL} /></b> in premium, <b>{pct(sum.blended, 2)}</b> annualised.</span><span className="announce-go">See the record <Icon name="arrow" size={13} /></span></a>}
    <header className="l-nav">
      <Link to="/" aria-label="Otzar home"><Wordmark /></Link>
      <nav aria-label="Sections">
        <a href="#vaults">Vaults</a><a href="#how">How it works</a><a href="#security">Security</a><a href="#record">Record</a><a href="#tech">NEAR</a>
      </nav>
      <div className="l-nav-end"><ApyChip /><Link to="/app" className="pill pill-ink pill-sm">Launch app</Link></div>
    </header>

    <main id="main">
      <section className="hero sunburst">
        <div className="stickers" aria-hidden="true">
          <Sticker name="vault" rot={-9} className="st st-1" />
          <Sticker name="coins" rot={7} className="st st-2" />
          <Sticker name="bell" rot={-14} className="st st-3" />
          <Sticker name="hourglass" rot={10} className="st st-4" />
          <Sticker name="gem" rot={-6} className="st st-5" />
          <Sticker name="star" rot={8} className="st st-6" />
        </div>
        <div className="hero-copy">
          <p className="hero-lbl"><span className="dot-jade" />Quantum-safe Bitcoin yield · NEAR testnet</p>
          <h1>Earn on native Bitcoin.<br /><span>Locked for Q-day.</span></h1>
          <p className="lede">Otzar vaults hold real BTC that only a post-quantum key can move. Sell covered calls on it and keep the premium. No bridge, no wrapping.</p>
          <div className="hero-apy" aria-live="polite">
            <b><CountUp value={sum?.blended ?? null} decimals={2} suffix="%" /></b>
            <span>realised APY · {sum ? `${sum.paid.length} paid rounds on NEAR testnet` : rounds.error ? rounds.error : 'reading rounds'}</span>
          </div>
          <div className="hero-cta">
            <Link to="/app" className="pill pill-ink pill-lg">Launch app <Icon name="arrow" size={17} /></Link>
            <a href="#how" className="pill pill-line pill-lg">How it works</a>
          </div>
        </div>
        {artSrc('otzar-hero') && <img className="hero-img" src={artSrc('otzar-hero')!} alt="A carved jade treasury vault with gold coins" loading="eager" />}
      </section>
      <LiveTape />

      <dl className="kpis" aria-label="Live from NEAR testnet">
        <div className="k-gold"><dt>Premium paid</dt><dd>{dash(sum, rounds.error) ?? <Amount e6={sum!.earned} unit={TUSDC_SYMBOL} />}</dd></div>
        <div className="k-jade"><dt>Realised APY</dt><dd>{dash(sum, rounds.error) ?? pct(sum!.blended, 2)}</dd></div>
        <div className="k-forest"><dt>Vault NFTs</dt><dd>{dash(boxes.data, boxes.error) ?? boxes.data!.length}<small>{sealed !== undefined ? ` · ${sealed} sealed` : ''}</small></dd></div>
        <div className="k-blush"><dt>BTC-USD · relayer price (testnet)</dt><dd>{relayer.data ? `$${e6(relayer.data.price_usd_e6, 0)}` : dash(relayer.data, relayer.error)}</dd></div>
      </dl>

      <div className="band band-blush"><section className="l-sec" id="vaults">
        <header className="l-head center"><Sticker name="vault" rot={-8} className="head-st" /><p className="lbl">Vaults</p><h2>One strategy, three ways in.</h2></header>
        <div className="products">
          <article className="product p-call">
            <Art name="otzar2-card-call" className="product-art" fallback={['coins', 'chart']} />
            <div className="product-top"><span className="vtag vtag-jade">Covered call</span><span className="status"><i className="live-dot" />Live · testnet</span></div>
            <h3>BTC Covered Call</h3>
            <p>Your vault sells calls on its native BTC. Buyers pay a premium up front; you keep it whether or not they exercise.</p>
            <div className="product-apy"><b>{sum ? pct(sum.blended, 1) : '…'}</b><span>realised APY · {sum ? `${sum.paid.length} paid rounds` : 'reading'}</span></div>
            <Link to="/app" className="pill pill-ink pill-block">Open vaults <Icon name="arrow" size={15} /></Link>
          </article>
          <article className="product p-qsafe">
            <Art name="otzar2-card-qsafe" className="product-art" fallback={['lock', 'key']} />
            <div className="product-top"><span className="vtag">Custody</span><span className="status"><i className="ok-dot" />Live · testnet</span></div>
            <h3>Quantum-safe vault</h3>
            <p>A NEAR NFT that owns its own Bitcoin, Ethereum and Solana addresses. Spends need an ML-DSA-65 signature, wait out a delay and can be clawed back.</p>
            <div className="product-apy"><b>{sealed ?? '…'}</b><span>vaults sealed with ML-DSA-65</span></div>
            <Link to="/app" className="pill pill-line pill-block">Mint a vault</Link>
          </article>
          <article className="product p-any">
            <Art name="otzar2-card-anychain" className="product-art" fallback={['arrow', 'btc']} />
            <div className="product-top"><span className="vtag">NEAR Intents</span><span className="status"><i className="warn-dot" />Quotes only</span></div>
            <h3>Deposit from any chain</h3>
            <p>Live 1Click quotes from ETH, SOL or USDC into a vault's native Bitcoin address. Executing a swap needs a funded mainnet account.</p>
            <div className="product-apy"><b className="small-b">Setup required</b><span>NEAR_MAINNET_ACCOUNT</span></div>
            <Link to="/app" className="pill pill-line pill-block">Get a dry quote</Link>
          </article>
        </div>
      </section></div>

      <div className="band band-forest"><section className="l-sec" id="how">
        <header className="l-head center"><Sticker name="chart" rot={7} className="head-st" /><p className="lbl">How it works</p><h2>Seal it. Sell the upside. Keep the premium.</h2></header>
        <ol className="steps3">
          <li><div className="step-art sa-gold"><Art name="otzar2-step-seal" fallback={['key']} /></div><span className="step-n">01</span><h3>Seal the vault</h3><p>Mint a vault NFT; NEAR Chain Signatures give it a native Bitcoin address. Register an ML-DSA-65 key and nothing moves without it.</p></li>
          <li><div className="step-art sa-blush"><Art name="otzar2-step-sell" fallback={['ticket']} /></div><span className="step-n">02</span><h3>Sell a round</h3><p>Write a covered call: strike, size, expiry. A Dutch auction lowers the premium until a buyer pays it in {TUSDC_SYMBOL}.</p></li>
          <li><div className="step-art sa-jade"><Art name="otzar2-step-settle" fallback={['clock']} /></div><span className="step-n">03</span><h3>Settle and keep it</h3><p>A signed Coinbase BTC-USD print settles the round. Below the strike your sats come back; above it the buyer pays the strike. The premium is yours.</p></li>
        </ol>
        {lead && <div className="snapshot card">
          <div className="card-title"><div><p className="lbl">Latest round · #{lead.id} · {short(lead.token_id, 12, 6)}</p><h3>Strike ${e6(lead.strike_usd_e6, 0)} on {btcFromSats(lead.size_sats)} BTC</h3></div><PhasePill c={lead} now={now} /></div>
          <dl className="cr-grid">
            <div><dt>Premium</dt><dd>{lead.premium_paid_usdc ? <Amount e6={lead.premium_paid_usdc} unit={TUSDC_SYMBOL} /> : '—'}</dd></div>
            <div><dt>Annualised</dt><dd className="jade">{pct(annualisedPct(lead))}</dd></div>
            <div><dt>Expiry</dt><dd>{utcTime(lead.expiry_ns)} <small>UTC · {utcDay(lead.expiry_ns)}</small></dd></div>
            <div><dt>Settled at</dt><dd>{lead.oracle_price_usd_e6 ? `$${e6(lead.oracle_price_usd_e6, 2)}` : '—'}</dd></div>
          </dl>
          <StrikeSpot c={lead} spotE6={lead.oracle_price_usd_e6 || relayer.data?.price_usd_e6 || null} spotLabel={lead.oracle_price_usd_e6 ? 'Settled at' : 'BTC now'} />
          <p className="fine">The trade-off is real: above the strike you give up the upside. The recorded rounds ran for about four minutes on a test token, so these are demo terms, not a forecast.</p>
        </div>}
      </section></div>

      <div className="band band-gold"><section className="l-sec" id="security">
        <header className="l-head center"><Art name="otzar2-security" className="sec-art" fallback={['shield', 'lock']} /><p className="lbl">Security</p><h2>Security you can check yourself.</h2><p className="l-lede">Bitcoin cannot enforce a spending cap, a delay, a guardian or an heir. The Otzar contract on NEAR does, before it asks the signer network for a signature.</p></header>
        <Safety />
        <div className="sec-links">
          {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer" className="pill pill-line pill-sm">Contract on NearBlocks <Icon name="external" size={13} /></a>}
          {evidenceMeta.priceTx && <a href={nearblocksTx(evidenceMeta.priceTx)} target="_blank" rel="noreferrer" className="pill pill-line pill-sm">Settlement price tx <Icon name="external" size={13} /></a>}
          <a href="#scan" className="pill pill-line pill-sm">Scan an address for exposure</a>
        </div>
      </section></div>

      <section className="l-sec" id="record">
        <header className="l-head l-head-row"><div><p className="lbl">The record</p><h2>Every transaction, on NEAR testnet.</h2></div><Link to="/app" className="mini-link">Open the app <Icon name="arrow" size={14} /></Link></header>
        <div className="card"><ActivityTable txns={txns.data} error={txns.error} loading={txns.loading} limit={8} /></div>
      </section>

      <section className="l-sec" id="scan">
        <header className="l-head"><p className="lbl">Quantum exposure scanner</p><h2>Is your address already exposed?</h2><p className="l-lede">Paste a Bitcoin or Ethereum address, or a P2PK public key. Otzar reads the public chain and tells you whether the public key is already visible. No wallet needed.</p></header>
        <ExposureScanner target={null} targetUsable={false} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      </section>

      <section className="l-sec" id="tech">
        <header className="l-head"><p className="lbl">Built on NEAR</p><h2>Five NEAR features, each with one job.</h2></header>
        <div className="tech">
          <article><h3>Chain Signatures</h3><p>The contract asks <code>{TESTNET_MPC}</code> to sign with a key derived from <code>hako/&lt;vault&gt;/&lt;epoch&gt;</code>. Selling the vault hands over its addresses; nothing is bridged.</p><span className="tech-live">{mpc.data ? <><i className="ok-dot" />root {short(String(mpc.data), 12, 6)}</> : mpc.error ? <span className="bad">{mpc.error}</span> : 'Reading signer…'}</span></article>
          <article><h3>ML-DSA on-chain</h3><p>Every spend, rule change, round and heir update carries an ML-DSA-65 signature over the vault ID, nonce and payload, checked with <code>env::ml_dsa_verify</code>.</p><span className="tech-live">{sealed !== undefined ? <><i className="ok-dot" />{sealed} keys registered</> : '…'}</span></article>
          <article><h3>NEP-141 premiums</h3><p>Buyers pay with one <code>ft_transfer_call</code> in {TUSDC_SYMBOL}, Otzar's own test token. The contract accepts it only at the current auction price.</p><span className="tech-live"><i className="ok-dot" />{short(evidenceMeta.premiumToken, 10, 8)}</span></article>
          <article><h3>Signed price relayer</h3><p>Pyth no longer serves NEAR, so a relayer signs the last Coinbase BTC-USD trade with an ed25519 key; <code>post_relayer_price</code> checks the key, source, 60-second freshness and forward-only time. Mainnet design: the Rhea oracle, not yet verified for BTC.</p><span className="tech-live">{relayer.data ? <><i className="ok-dot" />${e6(relayer.data.price_usd_e6, 2)} · {ago(relayer.data.publish_time_sec * 1e9, now)}</> : relayer.error ? <span className="bad">{relayer.error}</span> : '…'}</span></article>
          <article><h3>NEAR Intents · 1Click</h3><p>Each vault asks 1Click for a live <code>dry: true</code> quote from ETH, SOL or USDC into its next Bitcoin address. Quotes only.</p><span className="tech-live"><i className="warn-dot" />Setup required: NEAR_MAINNET_ACCOUNT</span></article>
        </div>
      </section>

      <section className="cta-band">
        <Art name="otzar2-cta" className="cta-art" fallback={['bag', 'sprout']} />
        <div><h2>Keep your Bitcoin in the treasury.</h2><p>Open the app, pick a vault and see its current round, strategy and deposit address.</p></div>
        <Link to="/app" className="pill pill-ink pill-lg">Launch app <Icon name="arrow" size={17} /></Link>
      </section>
    </main>

    <footer className="l-foot">
      <div className="l-foot-row">
        <div className="l-foot-brand"><Wordmark /><p>Quantum-safe Bitcoin vaults on NEAR testnet and local chains. A prototype, not a mainnet vault.</p></div>
        <nav aria-label="Footer"><Link to="/app">Vaults</Link><Link to="/you">Portfolio</Link><a href="#security">Security</a>{contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract <Icon name="external" size={12} /></a>}</nav>
      </div>
      <p className="l-foot-legal">MIT · © 2026 Nivesh Gajengi · {TUSDC_SYMBOL} is a test token with no value · Bitcoin runs on Core regtest</p>
    </footer>
  </>;
}
