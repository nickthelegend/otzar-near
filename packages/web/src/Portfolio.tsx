import { useState } from 'react';
import PortfolioTotals from './PortfolioTotals';
import Safety from './safety';
import { ActivityTable, StatCard, VaultTable } from './cards';
import { RoundSheet } from './RoundSheet';
import { useBoxes, useNow, useRounds, useTusdc, useTxns } from './data';
import { annualisedPct, anvilUrl, btcFromSats, contractId, earnedSummary, esploraUrl, nearblocksAccount, short, TUSDC_SYMBOL, utcDay, type Round } from './lib';
import { PhasePill } from './cards';
import { pct } from './rounds';
import { Amount, Icon, State } from './ui';
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

  return <div className="page port">
    <header className="dash-head">
      <div>
        <p className="lbl">Portfolio</p>
        <h1>{acct ? <a href={nearblocksAccount(acct)} target="_blank" rel="noreferrer">{short(acct, 18, 10)}</a> : 'Your position'}</h1>
        <p className="dash-sub">{acct ? 'Your vaults, the rounds you wrote or bought, and your test-token balance, read live from NEAR testnet.' : `Connect a NEAR testnet wallet to see your vaults, rounds and ${TUSDC_SYMBOL} balance. A testnet account is free at testnet.mynearwallet.com.`}</p>
      </div>
      {acct ? <button className="pill pill-ghost pill-sm" onClick={wallet.disconnect}>Sign out</button> : <button className="pill pill-ice" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect wallet</button>}
    </header>

    {acct ? <>
      <div className="stats4">
        <StatCard highlight label={`${TUSDC_SYMBOL} balance`} icon="wallet" value={bal.data !== null ? <Amount e6={bal.data} unit={TUSDC_SYMBOL} /> : bal.error ? 'Unavailable' : '…'} sub="Otzar test token, no value" />
        <StatCard label="Premium earned" icon="coin" value={rounds.data ? <Amount e6={wrote.earned} /> : '…'} sub={`${wrote.paid.length} paid rounds you wrote`} />
        <StatCard label="Realised APY" icon="spark" value={<span className="ice">{pct(wrote.blended, 2)}</span>} sub="on your paid rounds" />
        <StatCard label="Vaults" icon="key" value={boxes.data ? mine.length : '…'} sub={`${mine.filter(b => b.pq_key?.length).length} sealed with ML-DSA-65`} />
      </div>

      <section className="card">
        <div className="card-title"><div><h2>Your vaults</h2><p>Native BTC, ETH and SOL addresses owned by your NFTs.</p></div></div>
        {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults">{boxes.error}</State> : boxes.data ? <VaultTable boxes={boxes.data} rounds={rounds.data} account={acct} filter="mine" /> : <div className="vt-row skeleton" />}
        <PortfolioTotals boxes={boxes.data || []} account={acct} contractId={contractId} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      </section>

      <section className="card">
        <div className="card-title"><div><h2>Your rounds</h2><p>Covered calls you wrote as a vault owner or bought as a buyer.</p></div></div>
        {myRounds.length ? <div className="rt" role="table">
          <div className="rt-head" role="row"><span>Round</span><span>Role</span><span>Strike</span><span>Premium</span><span>APY</span><span>State</span></div>
          {myRounds.map(r => <button key={r.key} className="rt-row" onClick={() => setSheet(r)}>
            <span><b>#{r.id} {short(r.token_id, 12, 6)}</b><small>{utcDay(r.opened_ns)} · {btcFromSats(r.size_sats)} BTC</small></span>
            <span data-label="Role">{r.writer === acct ? 'Writer' : 'Buyer'}</span>
            <span data-label="Strike" className="mono">${(Number(r.strike_usd_e6) / 1e6).toLocaleString()}</span>
            <span data-label="Premium">{r.premium_paid_usdc ? <Amount e6={r.premium_paid_usdc} /> : <span className="dim">—</span>}</span>
            <span data-label="APY" className="ice">{pct(annualisedPct(r))}</span>
            <span data-label="State"><PhasePill c={r} now={now} /></span>
          </button>)}
        </div> : <State kind="empty" title={rounds.data ? 'No rounds with your account on them' : 'Reading rounds…'}>Write a round from one of your vaults, or buy an open one from a vault page.</State>}
      </section>

      <section className="card">
        <div className="card-title"><div><h2>Your activity</h2><p>Your recent transactions to the vault contract.</p></div></div>
        <ActivityTable txns={myTx} error={txns.error} loading={txns.loading} />
      </section>
    </> : <section className="card connect-card">
      <State kind="setup" title="No wallet connected" action={<button className="pill pill-ice pill-sm" onClick={wallet.connect} disabled={!wallet.ready}>Connect with MyNearWallet</button>}>Otzar runs on NEAR testnet. Your vaults, rounds and balances appear here once you connect.</State>
    </section>}

    <section className="port-safety" id="safety">
      <div className="card-title"><div><h2>How your vault is kept safe</h2><p>Four locks, in plain words.</p></div></div>
      <Safety compact />
    </section>
    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
