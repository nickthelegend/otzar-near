import { useEffect, useState } from 'react';
import { rootPublicKey, rpcQuery, TESTNET_MPC } from '@hako/sdk';
import ExposureScanner from './ExposureScanner';
import { ago, anvilUrl, contractId, esploraUrl, loadBoxes, navigate, nearblocksAccount, nearblocksTx, recentContractTxns, short, type Box, type ChainTx } from './lib';
import { Art, Chip, Eyebrow, Icon } from './ui';

const PYTH_BTC = 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';

type Live<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string };
function useLive<T>(load: () => Promise<T>, every = 0): Live<T> {
  const [live, setLive] = useState<Live<T>>({ state: 'loading' });
  useEffect(() => {
    let on = true;
    const tick = () => load().then(value => on && setLive({ state: 'ok', value })).catch(e => on && setLive({ state: 'error', message: (e as Error).message }));
    tick();
    const t = every ? setInterval(tick, every) : undefined;
    return () => { on = false; if (t) clearInterval(t); };
  }, []);
  return live;
}

function Stat({ label, live, pick }: { label: string; live: Live<Box[]>; pick: (b: Box[]) => number }) {
  return <div className="stat">
    <strong className={live.state !== 'ok' ? 'stat-dim' : ''}>{live.state === 'ok' ? pick(live.value) : '—'}</strong>
    <span>{label}</span>
  </div>;
}

export default function Landing() {
  const boxes = useLive(loadBoxes, 30000);
  const txns = useLive(() => recentContractTxns(6), 30000);
  const mpc = useLive(() => rootPublicKey() as Promise<string>);
  const pyth = useLive(() => rpcQuery('pyth-oracle.testnet', 'get_price_no_older_than', { price_id: PYTH_BTC, age: 60 }), 60000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const open = (e: React.MouseEvent) => { e.preventDefault(); navigate('/app'); };

  return <>
    <section className="hero">
      <div className="hero-art" aria-hidden="true"><img src="/art/hako-hero.webp" width="1536" height="1024" alt="" fetchPriority="high" /></div>
      <div className="hero-copy">
        <Eyebrow>post-quantum vault · NEAR testnet</Eyebrow>
        <h1>Your Bitcoin dies on Q-day.<br /><em>Hako doesn't.</em></h1>
        <p className="lede">A vault NFT that holds native BTC, ETH and SOL. Only a post-quantum ML-DSA key can order a spend, and every spend obeys a daily cap, a clawback delay, a guardian and an heir.</p>
        <div className="cta-row">
          <a className="btn btn-primary" href="/app" onClick={open}>Open the vault app <Icon name="arrow" /></a>
          <a className="btn btn-ghost" href="#scan"><Icon name="scan" /> Scan an address</a>
        </div>
      </div>
      <div className="hero-foot">
        <span>Contract</span>
        {contractId ? <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer"><code>{contractId}</code><Icon name="external" size={14} /></a> : <Chip tone="warn">Setup required: VITE_HAKO_CONTRACT</Chip>}
        <span className="hero-foot-sep" />
        <span>Signer</span><code>{TESTNET_MPC}</code>
      </div>
    </section>

    <section className="proof" aria-label="Live contract state">
      <div className="proof-head">
        <Eyebrow>live on NEAR testnet</Eyebrow>
        <p>Read from the contract every 30 seconds. Nothing on this strip is typed by hand.</p>
      </div>
      <div className="stats">
        <Stat label="Vault NFTs minted" live={boxes} pick={b => b.length} />
        <Stat label="Locked to an ML-DSA key" live={boxes} pick={b => b.filter(x => x.pq_key?.length).length} />
        <Stat label="Have issued an MPC signature" live={boxes} pick={b => b.filter(x => x.ever_signed).length} />
        <Stat label="Listed for sale" live={boxes} pick={b => b.filter(x => x.listed_yocto).length} />
      </div>
      {boxes.state === 'error' && <p className="inline-error" role="alert">{boxes.message}</p>}
      <div className="txfeed">
        <div className="txfeed-head"><span>Recent contract transactions</span><span>NearBlocks</span></div>
        {txns.state === 'loading' && <div className="txrow skeleton" aria-busy="true"><span /><span /><span /></div>}
        {txns.state === 'error' && <p className="inline-error" role="alert">Transactions unavailable: {txns.message}</p>}
        {txns.state === 'ok' && txns.value.length === 0 && <p className="muted">No transactions yet.</p>}
        {txns.state === 'ok' && txns.value.map((t: ChainTx) => <a key={t.hash} className="txrow" href={nearblocksTx(t.hash)} target="_blank" rel="noreferrer">
          <span className="tx-method">{t.method}</span>
          <span className="tx-signer">{short(t.signer, 14, 8)}</span>
          <Chip tone={t.ok ? 'ok' : 'bad'}>{t.ok ? 'Success' : 'Rejected'}</Chip>
          <span className="tx-age">{ago(t.ns, now)}</span>
          <span className="tx-hash">{short(t.hash, 6, 4)} <Icon name="external" size={14} /></span>
        </a>)}
      </div>
    </section>

    <section className="how" id="how">
      <div className="section-intro">
        <Eyebrow>how it works</Eyebrow>
        <h2>Three moves.<br /><span>Your coins never leave their chain.</span></h2>
      </div>
      <ol className="steps">
        <li><b>01</b><h3>Mint a box</h3><p>The NFT derives its own Bitcoin, Ethereum and Solana addresses through NEAR Chain Signatures. Fund them like any wallet.</p></li>
        <li><b>02</b><h3>Seal it with a quantum key</h3><p>Register an ML-DSA-65 public key. From then on, the contract signs nothing unless that key authorised it.</p></li>
        <li><b>03</b><h3>Spend under rules</h3><p>Over the daily cap is refused. Anything else waits out the delay, and your guardian can claw it back.</p></li>
      </ol>
    </section>

    <section className="panel panel-left">
      <Art className="panel-art art-flip" src="/art/hako-feature-key.webp" icon="key" label="A crystal key on a titanium plinth" />
      <div className="panel-copy">
        <Eyebrow>post-quantum authority</Eyebrow>
        <h2>Only an ML-DSA key can order a spend.</h2>
        <p>Bitcoin and Ethereum keys are elliptic-curve keys; once a public key is on-chain, a large quantum computer could derive it. Hako moves the decision of <em>who may spend</em> to a lattice signature that NEAR verifies on-chain.</p>
        <dl className="specs">
          <div><dt>Scheme</dt><dd>ML-DSA-65 (FIPS 204)</dd></div>
          <div><dt>Verified by</dt><dd><code>env::ml_dsa_verify</code></dd></div>
          <div><dt>Replay guard</dt><dd>per-box nonce in every signed message</dd></div>
          <div><dt>Change</dt><dd>always to a fresh next-epoch address</dd></div>
        </dl>
      </div>
    </section>

    <section className="panel panel-right">
      <Art className="panel-art" src="/art/hako-feature-lock.webp" icon="lock" label="A round vault door with a glowing clock dial" />
      <div className="panel-copy">
        <Eyebrow>rules bitcoin can't enforce</Eyebrow>
        <h2>A cap, a delay, a guardian, an heir.</h2>
        <p>The contract parses the real Bitcoin (BIP143) or Ethereum transaction before it asks the signer network for a signature, so the rules bind the actual coins.</p>
        <div className="rules-grid">
          <div><Icon name="coin" /><b>Daily cap</b><span>Spends over the per-day limit are refused on-chain.</span></div>
          <div><Icon name="clock" /><b>Clawback delay</b><span>New destinations wait; the guardian can pull funds to recovery.</span></div>
          <div><Icon name="shield" /><b>Guardians</b><span>M-of-N ML-DSA guardians rotate a lost key after a timelock.</span></div>
          <div><Icon name="heir" /><b>Heir</b><span>Miss your check-in and the NFT passes to your heir.</span></div>
        </div>
      </div>
    </section>

    <section className="yield" id="yield">
      <Art className="yield-art" src="/art/hako-feature-yield.webp" icon="coin" label="A golden stream of light flowing into a glass vault" />
      <div className="yield-inner">
        <div className="yield-copy">
          <Eyebrow>yield on native BTC</Eyebrow>
          <h2>Idle Bitcoin can earn a premium. <span>It stays on Bitcoin.</span></h2>
          <p>Sell a covered call from your box. A buyer pays a USDC premium for the right to buy your sats at a strike price before expiry. You keep the premium either way.</p>
          <p className="caveat">The trade-off is real: if BTC ends above the strike and the buyer exercises, you are paid the strike and give up the upside above it.</p>
        </div>
        <figure className="payoff">
          <svg viewBox="0 0 360 220" role="img" aria-label="Covered call payoff shape: rises with BTC price until the strike, then flat">
            <defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stopColor="#5cc3db" /><stop offset="1" stopColor="#c9f3fb" /></linearGradient></defs>
            <line x1="24" y1="190" x2="344" y2="190" className="axis" />
            <line x1="24" y1="20" x2="24" y2="190" className="axis" />
            <line x1="200" y1="20" x2="200" y2="190" className="strike" />
            <path d="M24 170 L200 64 L344 64" fill="none" stroke="url(#pg)" strokeWidth="2.5" />
            <path d="M24 186 L200 80 L344 80" fill="none" className="hold" />
            <text x="206" y="34">strike</text>
            <text x="250" y="56">capped upside</text>
            <text x="250" y="98" className="dim">BTC alone</text>
            <text x="300" y="208">BTC price →</text>
          </svg>
          <figcaption>Shape of the payoff, not a forecast. The gap between the lines is the premium.</figcaption>
        </figure>
        <ol className="yield-steps">
          <li><b>Write</b><span>Sign strike, size, expiry and premium range with your ML-DSA key.</span></li>
          <li><b>Auction</b><span>A Dutch auction lowers the asking premium; the first buyer pays with <code>ft_transfer_call</code>.</span></li>
          <li><b>Settle</b><span>At expiry the contract reads Pyth BTC/USD. Stale or missing price means no settlement.</span></li>
        </ol>
      </div>
    </section>

    <section className="scan-section" id="scan">
      <div className="section-intro center">
        <Eyebrow>quantum exposure scanner</Eyebrow>
        <h2>Is your address already exposed?</h2>
        <p>Paste a Bitcoin or Ethereum address, or a P2PK public key. Hako reads the public chain and tells you whether the public key is already visible, and how much sits behind it. No wallet needed.</p>
      </div>
      <ExposureScanner target={null} targetUsable={false} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
    </section>

    <section className="tech" id="tech">
      <div className="section-intro">
        <Eyebrow>the NEAR pieces</Eyebrow>
        <h2>Four NEAR features,<br /><span>each doing one concrete job.</span></h2>
      </div>
      <div className="tech-grid">
        <article>
          <span className="tech-k">Chain Signatures</span>
          <h3>One NFT, three native addresses.</h3>
          <p>The contract asks <code>{TESTNET_MPC}</code> to sign with a key derived from the path <code>hako/&lt;box&gt;/&lt;epoch&gt;</code>. Selling the box hands over the addresses; nothing is bridged or wrapped.</p>
          <div className="tech-live">{mpc.state === 'ok' ? <><Chip tone="ok">Live</Chip><code>root {short(String(mpc.value), 14, 6)}</code></> : mpc.state === 'error' ? <Chip tone="bad">{mpc.message}</Chip> : <Chip>Reading signer…</Chip>}</div>
        </article>
        <article>
          <span className="tech-k">ML-DSA on-chain</span>
          <h3>Post-quantum signatures, checked by the runtime.</h3>
          <p>Every spend, policy change, call write and heir update carries an ML-DSA-65 signature over the box ID, nonce and payload. The contract rejects anything else.</p>
          <div className="tech-live"><Chip tone="ice">Boundary</Chip><span>The signer network and Bitcoin signatures stay ECDSA; ML-DSA decides who may ask.</span></div>
        </article>
        <article>
          <span className="tech-k">NEAR Intents · 1Click</span>
          <h3>Deposit anything, land as native BTC.</h3>
          <p>The Earn tab requests live <code>dry: true</code> 1Click quotes from ETH, SOL or USDC into the box's next-epoch Bitcoin address. Quotes only; no deposit address is issued.</p>
          <div className="tech-live"><Chip tone="warn">Mainnet only</Chip><span>Execution needs NEAR_MAINNET_ACCOUNT.</span></div>
        </article>
        <article>
          <span className="tech-k">Pyth on NEAR</span>
          <h3>Settlement reads a fresh BTC/USD price.</h3>
          <p>Covered calls settle against <code>pyth-oracle.testnet</code> with a 60-second freshness bound. A missing or stale price leaves the call unsettled instead of guessing.</p>
          <div className="tech-live">{pyth.state === 'ok' ? (pyth.value ? <><Chip tone="ok">Fresh</Chip><code>BTC/USD {(Number((pyth.value as any).price) * 10 ** Number((pyth.value as any).expo)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</code></> : <><Chip tone="warn">No fresh update</Chip><span>The feed returned null just now.</span></>) : pyth.state === 'error' ? <Chip tone="bad">{pyth.message}</Chip> : <Chip>Reading oracle…</Chip>}</div>
        </article>
      </div>
    </section>

    <section className="closer">
      <Art className="closer-art" src="/art/hako-og.webp" icon="box" label="Three glass vaults on a dark reflective floor" />
      <div className="closer-copy">
        <h2>Put a box around it.</h2>
        <p>Connect a NEAR testnet wallet, mint a vault and seal it with a key that survives Q-day.</p>
        <a className="btn btn-primary" href="/app" onClick={open}>Open the vault app <Icon name="arrow" /></a>
      </div>
    </section>
  </>;
}
