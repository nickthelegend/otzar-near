import { useState } from 'react';
import { rootPublicKey, TESTNET_MPC } from '@hako/sdk';
import ExposureScanner from './ExposureScanner';
import Safety from './safety';
import LiveTape from './tape';
import { Drawer } from './Vaults';
import { useBoxes, useLive, useNow, useRelayer, useRounds, useTxns } from './data';
import { ago, annualisedPct, anvilUrl, contractId, e6, earnedSummary, esploraUrl, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL } from './lib';
import { AprRange, Dial, evidenceFor, evidenceMeta, pct, Ticket } from './rounds';
import { Amount, Glow, Icon, Link, Wordmark } from './ui';

export default function Landing() {
  const rounds = useRounds(); const boxes = useBoxes(); const relayer = useRelayer(); const txns = useTxns();
  const mpc = useLive<string>('mpc-root', () => rootPublicKey() as Promise<string>, 600000);
  const now = useNow(5000);
  const [menu, setMenu] = useState(false);
  const paid = (rounds.data || []).filter(r => r.premium_paid_usdc);
  const lead = paid.find(r => roundPhase(r, now).phase === 'itm') || paid[0] || rounds.data?.[0];
  const second = paid.find(r => r.key !== lead?.key) || rounds.data?.find(r => r.key !== lead?.key);
  const sum = rounds.data ? earnedSummary(rounds.data) : null;
  const sealed = boxes.data?.filter(b => b.pq_key?.length).length;
  const leadPh = lead ? roundPhase(lead, now) : null;

  return <>
    <header className="l-nav">
      <Link to="/" aria-label="Hako home"><Wordmark /></Link>
      <nav aria-label="Sections" className={menu ? 'open' : ''}>
        <a href="#round" onClick={() => setMenu(false)}>How a round works</a>
        <a href="#wall" onClick={() => setMenu(false)}>The wall</a>
        <a href="#safety" onClick={() => setMenu(false)}>Safety</a>
        <a href="#tech" onClick={() => setMenu(false)}>NEAR</a>
      </nav>
      <Link to="/app" className="pill pill-ice pill-sm">Open the vault</Link>
    </header>

    <main id="main">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="lbl hero-lbl"><span className="kanji">箱</span>Quantum-safe BTC yield · NEAR testnet</p>
            <h1>Bitcoin that <em>earns</em>,<br /><span className="h1-line">locked for Q-day.</span></h1>
            <p className="lede">Put native BTC in a box only a post-quantum key can open. Sell covered calls on it and keep the premium. It never leaves Bitcoin and is never wrapped.</p>
            <div className="hero-cta">
              <Link to="/app" className="pill pill-ice pill-lg">Open the vault <Icon name="arrow" size={17} /></Link>
              <a href="#round" className="pill pill-ghost pill-lg">How it works</a>
            </div>
            <p className="hero-live" aria-live="polite">{sum && sum.paid.length
              ? <><i className="live-dot" />So far the vaults earned <b><Amount e6={sum.earned} unit={TUSDC_SYMBOL} /></b> on NEAR testnet, <b>{pct(sum.blended, 2)}</b> annualised.</>
              : rounds.error ? <>Live read failed: {rounds.error}</> : <><i className="pulse" /> Reading the rounds from NEAR testnet…</>}</p>
          </div>
          <div className="hero-stage" aria-label="The latest settled round, read live">
            <Glow name="box" className="stage-glow" />
            <div className="stage-ring" aria-hidden="true" />
            {second && <div className="stage-back"><Ticket c={second} now={now} /></div>}
            {lead ? <div className="stage-front"><Ticket c={lead} now={now} lead /></div> : <div className="stage-front"><div className="ticket skeleton" /></div>}
            {relayer.data && <span className="float-tag tag-price"><Icon name="wave" size={14} />BTC-USD ${e6(relayer.data.price_usd_e6, 0)}<small>relayer price (testnet)</small></span>}
            {sealed !== undefined && <span className="float-tag tag-seal"><Icon name="key" size={14} />{sealed} of {boxes.data!.length} vaults sealed<small>ML-DSA-65</small></span>}
          </div>
        </div>
        <LiveTape />
      </section>

      <section className="l-sec" id="round">
        <header className="l-head"><p className="lbl">How a round works</p><h2>Seal it. Sell the upside.<br /><span>Keep the premium.</span></h2></header>
        <ol className="beats">
          <li className="beat">
            <span className="beat-n">01</span>
            <h3>Seal the box</h3>
            <p>Mint a vault NFT. NEAR Chain Signatures give it its own native Bitcoin address. Register an ML-DSA-65 key, and from then on nothing moves without that key's signature.</p>
            <div className="beat-live"><b>{sealed ?? '…'}<small>/{boxes.data?.length ?? '…'}</small></b><span>vaults on testnet are sealed with an ML-DSA key</span></div>
          </li>
          <li className="beat">
            <span className="beat-n">02</span>
            <h3>Sell a round</h3>
            <p>Offer a covered call: a strike, a size and an expiry, signed with your quantum key. A Dutch auction lowers the premium until a buyer pays it in {TUSDC_SYMBOL}.</p>
            <div className="beat-live">{lead ? <><b><Amount e6={lead.premium_paid_usdc || '0'} digits={6} /><small>{TUSDC_SYMBOL}</small></b><span>paid for round #{lead.id} on {short(lead.token_id, 10, 4)}</span><AprRange c={lead} compact /></> : <span>{rounds.error || 'Reading…'}</span>}</div>
          </li>
          <li className="beat">
            <span className="beat-n">03</span>
            <h3>Settle and keep it</h3>
            <p>At expiry a signed Coinbase BTC-USD print settles the round. Below the strike your sats come back; above it the buyer pays the strike and takes them. The premium is yours either way.</p>
            <div className="beat-live">{lead?.oracle_price_usd_e6 ? <><b>${e6(lead.oracle_price_usd_e6, 0)}</b><span>settlement print · strike ${e6(lead.strike_usd_e6, 0)} · {leadPh?.label.toLowerCase()}</span></> : <span>{rounds.data ? 'No round has settled yet' : 'Reading…'}</span>}</div>
          </li>
        </ol>
        <p className="beats-caveat">The trade-off is real: above the strike you give up the upside. Premiums here are demo terms on a test token, not a forecast.</p>
      </section>

      <section className="l-sec" id="wall">
        <header className="l-head l-head-row">
          <div><p className="lbl">The wall · live vault NFTs</p><h2>{boxes.data ? <>{boxes.data.length} boxes on the wall.</> : 'The wall.'}<br /><span>Every one is an NFT on NEAR.</span></h2></div>
          <Link to="/vaults" className="l-more">Open the wall <Icon name="arrow" size={16} /></Link>
        </header>
        {boxes.error && !boxes.data ? <p className="err-line" role="alert">Could not read the contract: {boxes.error}</p>
          : <div className="wall wall-landing">{boxes.data ? boxes.data.slice(0, 12).map(b => <Drawer key={b.token_id} b={b} account="" round={rounds.data?.find(r => r.token_id === b.token_id)} now={now} />) : Array.from({ length: 8 }, (_, i) => <div key={i} className="drawer skeleton" />)}</div>}
        <div className="legend" aria-hidden="true"><span><i className="on" />ML-DSA key</span><span><i className="on" />Spending rules</span><span><i className="on" />Has signed</span></div>
      </section>

      <section className="l-sec" id="safety">
        <header className="l-head"><p className="lbl">Safety, plainly</p><h2>Four locks on every box.<br /><span>Bitcoin can't enforce any of them. NEAR does.</span></h2></header>
        <Safety />
      </section>

      <section className="l-sec" id="record">
        <header className="l-head"><p className="lbl">The record</p><h2>Read from the chain,<br /><span>not typed by hand.</span></h2></header>
        <div className="record">
          <div className="record-earned">
            <Dial value={sum?.blended ?? null} label={sum?.blended != null ? `${sum.blended.toFixed(1)}%` : '…'} sub="annualised" />
            <div>
              <p className="lbl">Premium paid to writers</p>
              <p className="record-big">{sum ? <Amount e6={sum.earned} unit={TUSDC_SYMBOL} /> : '…'}</p>
              <ul className="record-runs">{paid.map(r => { const ev = evidenceFor(r); const ph = roundPhase(r, now); return <li key={r.key}>
                <span className={`stamp stamp-${ph.phase}`}>{ph.short}</span>
                <span>#{r.id} {short(r.token_id, 10, 4)} · <Amount e6={r.premium_paid_usdc} /> · {pct(annualisedPct(r))}</span>
                {ev && <span className="record-tx">{[['Write', ev.write], ['Premium', ev.buy], ['Settle', ev.settle]].filter(([, h]) => h).map(([k, h]) => <a key={k} href={nearblocksTx(h!)} target="_blank" rel="noreferrer">{k}<Icon name="external" size={11} /></a>)}</span>}
              </li>; })}</ul>
              <p className="fine">{TUSDC_SYMBOL} is Hako's own test token (<a href={nearblocksAccount(evidenceMeta.premiumToken)} target="_blank" rel="noreferrer">{evidenceMeta.premiumToken}</a>), no value. Bitcoin is Core regtest.</p>
            </div>
          </div>
          <div className="receipt">
            <div className="receipt-head"><b>Contract transactions</b><span>NearBlocks · testnet</span></div>
            {txns.error && !txns.data ? <p className="err-line">Unavailable: {txns.error}</p>
              : !txns.data ? <p className="receipt-row dim"><i className="pulse" /> Reading…</p>
              : txns.data.length === 0 ? <p className="receipt-row dim">No transactions yet.</p>
              : txns.data.map(t => <a key={t.hash} className="receipt-row" href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer">
                <span className="r-m">{t.method}</span><span className="r-s">{short(t.signer, 12, 6)}</span><span className={t.ok ? 'r-ok' : 'r-bad'}>{t.ok ? 'ok' : 'rejected'}</span><span className="r-t">{ago(t.ns, now)}</span>
              </a>)}
            {contractId && <a className="receipt-foot" href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">{contractId} <Icon name="external" size={12} /></a>}
          </div>
        </div>
      </section>

      <section className="l-sec" id="scan">
        <header className="l-head"><p className="lbl">Quantum exposure scanner</p><h2>Is your address already exposed?<br /><span>Paste it. No wallet needed.</span></h2></header>
        <ExposureScanner target={null} targetUsable={false} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      </section>

      <section className="l-sec" id="tech">
        <header className="l-head"><p className="lbl">The NEAR pieces</p><h2>Five NEAR features,<br /><span>each with one job.</span></h2></header>
        <ol className="tech">
          <li><span className="tech-n">Chain Signatures</span><div><h3>One NFT, native addresses on three chains.</h3><p>The contract asks <code>{TESTNET_MPC}</code> to sign with a key derived from <code>hako/&lt;box&gt;/&lt;epoch&gt;</code>. Selling the box hands over the addresses; nothing is bridged.</p></div><span className="tech-live">{mpc.data ? <><i className="ok-dot" />root {short(String(mpc.data), 12, 6)}</> : mpc.error ? <span className="bad">{mpc.error}</span> : 'Reading signer…'}</span></li>
          <li><span className="tech-n">ML-DSA on-chain</span><div><h3>Post-quantum signatures, checked by the runtime.</h3><p>Every spend, rule change, call write and heir update carries an ML-DSA-65 signature over the box ID, nonce and payload, verified with <code>env::ml_dsa_verify</code>.</p></div><span className="tech-live">{sealed !== undefined ? <><i className="ok-dot" />{sealed} keys registered</> : '…'}</span></li>
          <li><span className="tech-n">NEP-141 premiums</span><div><h3>Buyers pay with one <code>ft_transfer_call</code>.</h3><p>The premium token is {TUSDC_SYMBOL}, Hako's own test token. The contract's <code>ft_on_transfer</code> accepts the payment only at the current auction price.</p></div><span className="tech-live"><i className="ok-dot" />{short(evidenceMeta.premiumToken, 10, 8)}</span></li>
          <li><span className="tech-n">Signed price relayer</span><div><h3>Settlement uses a price the contract can check.</h3><p>Pyth no longer serves NEAR, so on testnet a relayer signs the last Coinbase BTC-USD trade with an ed25519 key. <code>post_relayer_price</code> checks the key, the source, 60-second freshness and forward-only time. Mainnet design: the Rhea oracle, not yet verified for BTC.</p></div><span className="tech-live">{relayer.data ? <><i className="ok-dot" />${e6(relayer.data.price_usd_e6, 2)} · {ago(relayer.data.publish_time_sec * 1e9, now)}</> : relayer.error ? <span className="bad">{relayer.error}</span> : '…'}</span></li>
          <li><span className="tech-n">NEAR Intents · 1Click</span><div><h3>Deposit from another chain, land as native BTC.</h3><p>Each vault's Earn tab asks 1Click for a live <code>dry: true</code> quote from ETH, SOL or USDC into its next Bitcoin address. Quotes only; executing one needs a funded mainnet account.</p></div><span className="tech-live"><i className="warn-dot" />Setup required: NEAR_MAINNET_ACCOUNT</span></li>
        </ol>
      </section>

      <section className="closer">
        <Glow name="trio" className="closer-glow" />
        <h2>Put a box around it.</h2>
        <Link to="/app" className="pill pill-ice pill-lg">Open the vault <Icon name="arrow" size={17} /></Link>
      </section>
    </main>

    <footer className="l-foot">
      <div className="l-foot-row">
        <Wordmark />
        <p>Quantum-safe Bitcoin vaults on NEAR testnet and local chains. A prototype, not a mainnet vault. MIT · © 2026 Nivesh Gajengi</p>
        {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract <Icon name="external" size={12} /></a>}
      </div>
      <p className="l-foot-mark" aria-hidden="true">箱</p>
    </footer>
  </>;
}

