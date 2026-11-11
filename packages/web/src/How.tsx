import { rootPublicKey, TESTNET_MPC } from '@hako/sdk';
import ExposureScanner from './ExposureScanner';
import Safety from './safety';
import { roundSentence, StrikeSpot } from './cards';
import { useBoxes, useLive, useNow, useRelayer, useRounds } from './data';
import { ago, anvilUrl, contractId, e6, esploraUrl, nearblocksAccount, nearblocksTx, TUSDC_SYMBOL, utcDay } from './lib';
import { evidenceMeta } from './rounds';
import { Icon, Link } from './ui';
import { SiteFoot, SiteNav } from './Landing';

/** How it works, written like a docs page: prose, one real round, the safety rules, the NEAR parts and questions. */
export default function How() {
  const rounds = useRounds(); const boxes = useBoxes(); const relayer = useRelayer();
  const mpc = useLive<string>('mpc-root', () => rootPublicKey() as Promise<string>, 600000);
  const now = useNow(10000);
  const sealed = boxes.data?.filter(b => b.pq_key?.length).length;
  const lead = rounds.data?.find(r => r.premium_paid_usdc && r.oracle_price_usd_e6) || rounds.data?.find(r => r.premium_paid_usdc) || rounds.data?.[0];

  return <>
    <SiteNav />
    <main id="main" className="doc">
      <h1>How Otzar works</h1>
      <p className="doc-lede">A covered call, run by a contract on NEAR, on Bitcoin that stays Bitcoin.</p>
      <ol className="doc-steps">
        <li><b>You put Bitcoin in a vault.</b> Each vault is an NFT in your NEAR wallet with its own native Bitcoin address. No bridge, no wrapped coin.</li>
        <li><b>You offer it at a higher price.</b> Pick a price above today’s (the strike). A buyer pays you a premium now for the right to buy at that price when the round ends.</li>
        <li><b>You keep the premium.</b> If BTC ends below the strike, you keep your BTC too. If it ends above, you sell at the strike and give up the gain past it.</li>
      </ol>

      {lead && <section className="doc-sec">
        <h2>A real round on testnet</h2>
        <p className="doc-round">{roundSentence(lead, now)}</p>
        <StrikeSpot c={lead} spotE6={lead.oracle_price_usd_e6 || relayer.data?.price_usd_e6 || null} spotLabel={lead.oracle_price_usd_e6 ? 'BTC settled' : 'Last relayer price'} />
        <p className="doc-note">{utcDay(lead.opened_ns)}. Test rounds ran for about four minutes on a test token, so read the yield as a demo, not a forecast. <Link to={`/vault/${lead.token_id}`}>Open this vault</Link>.</p>
      </section>}

      <section className="doc-sec" id="safety">
        <h2>What keeps it safe</h2>
        <p>Bitcoin can’t enforce a spending cap, a delay, a guardian or an heir. The Otzar contract on NEAR does, before it asks for a signature.</p>
        <Safety />
      </section>

      <section className="doc-sec" id="near">
        <h2>The NEAR parts</h2>
        <table className="doc-table">
          <thead><tr><th>Feature</th><th>What it does here</th><th>Live</th></tr></thead>
          <tbody>
            <tr><td>Chain Signatures</td><td>Gives each vault Bitcoin, Ethereum and Solana addresses from the NEAR signer <code>{TESTNET_MPC}</code>. Selling the NFT hands them over.</td><td>{mpc.data ? 'Signer online' : mpc.error ? <span className="bad">Unavailable</span> : '…'}</td></tr>
            <tr><td>ML-DSA on-chain</td><td>Every spend, rule change and round carries an ML-DSA-65 signature checked with <code>env::ml_dsa_verify</code>.</td><td>{sealed !== undefined ? `${sealed} keys` : '…'}</td></tr>
            <tr><td>NEP-141</td><td>Buyers pay the premium in {TUSDC_SYMBOL} with one <code>ft_transfer_call</code>, accepted only at the auction price.</td><td><a href={nearblocksAccount(evidenceMeta.premiumToken)} target="_blank" rel="noreferrer">Token</a></td></tr>
            <tr><td>Signed price</td><td>Pyth no longer serves NEAR, so a relayer signs the last Coinbase BTC-USD trade; the contract checks key, source and a 60-second window.</td><td>{relayer.data ? <>${e6(relayer.data.price_usd_e6, 0)}, {ago(relayer.data.publish_time_sec * 1e9, now)}</> : relayer.error ? <span className="bad">Unavailable</span> : '…'}</td></tr>
            <tr><td>NEAR Intents</td><td>Live 1Click quotes from ETH, SOL or USDC into a vault’s next Bitcoin address.</td><td>Quotes only</td></tr>
          </tbody>
        </table>
        <p className="doc-note">Contract <a href={contractId ? nearblocksAccount(contractId) : '#'} target="_blank" rel="noreferrer">{contractId}</a>{evidenceMeta.priceTx && <> · <a href={nearblocksTx(evidenceMeta.priceTx)} target="_blank" rel="noreferrer">settlement price transaction</a></>}. Executing 1Click swaps needs NEAR_MAINNET_ACCOUNT.</p>
      </section>

      <section className="doc-sec" id="faq">
        <h2>Questions</h2>
        <div className="doc-faq">
          <details><summary>What do I give up?</summary><p>The gain above the strike. If BTC jumps past your price, the buyer gets that gain. That is the trade for being paid up front.</p></details>
          <details><summary>How is the APY worked out?</summary><p>The premium actually paid, divided by the value of the BTC offered at the strike, scaled to a year.</p></details>
          <details><summary>What is tUSDC?</summary><p>Otzar’s test token on NEAR testnet, used to pay premiums. It is deployed as “tUSDC (Hako test)” and has no value.</p></details>
          <details><summary>What does “quantum-safe” mean here?</summary><p>Who may ask to move the coins is decided by a post-quantum key that NEAR checks. The signer network and Bitcoin itself still use classical keys.</p></details>
          <details><summary>Why do some IDs say Hako?</summary><p>Otzar used to be called Hako. The contract ID, the address path <code>hako/&lt;vault&gt;/&lt;epoch&gt;</code> and the test token’s name keep it, because renaming them would change every vault’s addresses.</p></details>
        </div>
      </section>

      <section className="doc-sec" id="scan">
        <h2>Is your address already exposed?</h2>
        <p>Paste a Bitcoin or Ethereum address, or a P2PK public key, to see whether its public key is already visible on chain.</p>
        <ExposureScanner target={null} targetUsable={false} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      </section>

      <p className="doc-end"><Link to="/app" className="pill pill-jade pill-lg">Open the app <Icon name="arrow" size={17} /></Link></p>
    </main>
    <SiteFoot />
  </>;
}
