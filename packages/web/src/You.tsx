import { useState } from 'react';
import PortfolioTotals from './PortfolioTotals';
import Safety from './safety';
import { Drawer } from './Vaults';
import { RoundSheet } from './Earn';
import { useBoxes, useNow, useRounds, useTusdc } from './data';
import { anvilUrl, contractId, earnedSummary, esploraUrl, nearblocksAccount, TUSDC_SYMBOL, type Round } from './lib';
import { Ticket } from './rounds';
import { Amount, Icon, Link, State } from './ui';
import type { Wallet } from './wallet';

export default function You({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const now = useNow(10000);
  const bal = useTusdc(wallet.account);
  const [sheet, setSheet] = useState<Round | null>(null);
  const acct = wallet.account;
  const mine = (boxes.data || []).filter(b => b.owner_id === acct);
  const myRounds = (rounds.data || []).filter(r => r.writer === acct || r.holder === acct);
  const wrote = earnedSummary(myRounds.filter(r => r.writer === acct));
  return <div className="page you">
    <section className="you-card">
      <div className="you-id">
        <span className="you-avatar" aria-hidden="true">{acct ? acct.slice(0, 1).toUpperCase() : <Icon name="user" size={22} />}</span>
        <div>
          <p className="lbl">{acct ? 'Signed in · NEAR testnet' : 'Not signed in'}</p>
          <h1>{acct ? <a href={nearblocksAccount(acct)} target="_blank" rel="noreferrer">{acct}</a> : 'You'}</h1>
        </div>
      </div>
      {acct ? <dl className="you-stats">
        <div><dt>{TUSDC_SYMBOL} balance</dt><dd>{bal.data !== null ? <Amount e6={bal.data} /> : bal.error ? 'Unavailable' : '…'}</dd></div>
        <div><dt>Vaults</dt><dd>{boxes.data ? mine.length : '…'}</dd></div>
        <div><dt>Premium earned</dt><dd>{rounds.data ? <Amount e6={wrote.earned} /> : '…'}</dd></div>
      </dl> : <p className="you-pitch">Connect a NEAR testnet wallet to see the vaults you own, the rounds you wrote or bought, and your {TUSDC_SYMBOL} balance. A testnet account is free at testnet.mynearwallet.com.</p>}
      <div className="you-actions">{acct ? <button className="pill pill-ghost pill-sm" onClick={wallet.disconnect}>Sign out</button> : <button className="pill pill-ice" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect with MyNearWallet</button>}</div>
    </section>

    {acct && <>
      <section className="you-sec">
        <header className="sec-head"><div><p className="lbl">Your vaults</p><h2>{mine.length ? `${mine.length} on the wall` : 'None yet'}</h2></div><Link to="/vaults" className="pill pill-ghost pill-sm">The wall <Icon name="arrow" size={14} /></Link></header>
        {boxes.error && !boxes.data ? <State kind="error" title="Could not read the vaults">{boxes.error}</State>
          : mine.length ? <div className="wall wall-sm">{mine.map(b => <Drawer key={b.token_id} b={b} account={acct} round={rounds.data?.find(r => r.token_id === b.token_id)} now={now} />)}</div>
          : <State kind="empty" title="You own no vaults" action={<Link to="/vaults" className="pill pill-ice pill-sm">Mint a box</Link>}>Mint one from the wall, then seal it with an ML-DSA key.</State>}
        <PortfolioTotals boxes={boxes.data || []} account={acct} contractId={contractId} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      </section>
      <section className="you-sec">
        <header className="sec-head"><div><p className="lbl">Your rounds</p><h2>{myRounds.length ? `${myRounds.length} written or bought` : 'No rounds yet'}</h2></div></header>
        {myRounds.length ? <div className="tickets">{myRounds.map(r => <Ticket key={r.key} c={r} now={now} onOpen={() => setSheet(r)} />)}</div>
          : <State kind="empty" title={rounds.data ? 'No covered calls with your name on them' : 'Reading rounds…'}>Write a round from one of your vaults, or buy an open one on Earn.</State>}
      </section>
    </>}

    <section className="you-sec" id="safety">
      <header className="sec-head"><div><p className="lbl">How your box is kept safe</p><h2>Four locks, in plain words.</h2></div></header>
      <Safety compact />
    </section>
    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
