import { useState } from 'react';
import { Card, Feed, RoundPill, Stat, v3art, VaultRows } from './blocks';
import { useBoxes, useNow, useRounds, useTusdc, useTxns } from './data';
import { btcFromSats, e6, earnedSummary, nearblocksAccount, short, TUSDC_SYMBOL, utcDay, type Round } from './lib';
import { RoundSheet } from './RoundSheet';
import { PageHead } from './shell';
import { CountUp } from './art';
import { Icon, Link } from './ui';
import type { Wallet } from './wallet';

function RoundTable({ rows, side, onOpen }: { rows: Round[]; side: 'wrote' | 'bought'; onOpen: (r: Round) => void }) {
  const now = useNow(5000);
  if (!rows.length) return <div className="o-empty o-empty-sm"><img src={v3art('otzar-empty')} alt="" /><b>{side === 'wrote' ? 'No calls written yet' : 'No calls bought yet'}</b><p>{side === 'wrote' ? 'Write one from a vault you own.' : 'Open auctions are on Buy calls.'}</p><Link to={side === 'wrote' ? '/write' : '/market'} className="o-btn o-btn-line o-btn-sm">{side === 'wrote' ? 'Write a call' : 'Buy a call'}</Link></div>;
  return <div className="o-table o-table-rounds" role="table">
    <div className="o-tr o-th" role="row"><span>Vault</span><span>Strike</span><span>Size</span><span>Status</span><span className="o-num">{side === 'wrote' ? 'Premium earned' : 'Premium paid'}</span></div>
    {rows.map(r => <button key={r.key} className="o-tr" onClick={() => onOpen(r)}>
      <span className="o-vault"><img src={v3art('otzar-icon-128')} alt="" width="32" height="32" /><span><b>{short(r.token_id, 18, 6)}</b><small>Round #{r.id} · {utcDay(r.opened_ns)}</small></span></span>
      <span className="tnum" data-label="Strike">${e6(r.strike_usd_e6, 0)}</span>
      <span className="tnum" data-label="Size">{btcFromSats(r.size_sats)} BTC</span>
      <span data-label="Status"><RoundPill r={r} now={now} /></span>
      <span className="o-num tnum" data-label="Premium">{r.premium_paid_usdc ? <b>{e6(r.premium_paid_usdc, 6)} <small>{TUSDC_SYMBOL}</small></b> : <span className="dim">—</span>}</span>
    </button>)}
  </div>;
}

export default function Positions({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes(); const rounds = useRounds(); const txns = useTxns(25); const bal = useTusdc(wallet.account);
  const [tab, setTab] = useState<'vaults' | 'wrote' | 'bought' | 'activity'>('vaults');
  const [sheet, setSheet] = useState<Round | null>(null);
  const acct = wallet.account;
  if (!acct) return <div className="o-page"><PageHead title="Positions" />
    <div className="o-hero-empty"><img src={v3art('otzar-vault-lock')} alt="A jade vault with a second, lattice padlock" /><div><h2>Your vaults and what they earned</h2><p>Connect a NEAR testnet wallet to see the vaults you own, the calls you wrote or bought and your {TUSDC_SYMBOL} balance.</p><button className="o-btn o-btn-ink o-btn-lg" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect wallet</button></div></div></div>;
  const mine = (boxes.data || []).filter(b => b.owner_id === acct);
  const wrote = (rounds.data || []).filter(r => r.writer === acct);
  const bought = (rounds.data || []).filter(r => r.holder === acct);
  const earned = earnedSummary(wrote).earned;
  const paid = bought.reduce((n, r) => n + BigInt(r.premium_paid_usdc || '0'), 0n);
  const tabs = [['vaults', 'Vaults', mine.length], ['wrote', 'Calls written', wrote.length], ['bought', 'Calls bought', bought.length], ['activity', 'Activity', null]] as const;

  return <div className="o-page">
    <PageHead title="Positions" sub={<a href={nearblocksAccount(acct)} target="_blank" rel="noreferrer" className="mono">{acct} <Icon name="external" size={12} /></a>} actions={<Link to="/write" className="o-btn o-btn-ink">Write a call <Icon name="arrow" size={15} /></Link>} />
    <section className="o-kpis" aria-label="Your totals">
      <Stat live k={`${TUSDC_SYMBOL} balance`} v={bal.data !== null ? e6(bal.data, 2) : bal.error ? 'Unavailable' : '…'} sub="Test token, no value" />
      <Stat k="Premium earned" v={rounds.data ? <>{e6(earned.toString(), 6)}</> : '…'} sub={`${wrote.filter(r => r.premium_paid_usdc).length} paid rounds as writer`} />
      <Stat k="Premium paid" v={rounds.data ? e6(paid.toString(), 6) : '…'} sub={`${bought.length} calls held`} />
      <Stat k="Vaults" v={boxes.data ? <CountUp value={mine.length} decimals={0} /> : '…'} sub={<span className="o-sub-ok"><Icon name="shield" size={12} /> {mine.filter(b => b.pq_key).length} quantum-locked</span>} />
    </section>
    <Card className="o-card-flush" title={<div className="o-seg" role="tablist" aria-label="Positions">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{n !== null && <small>{n}</small>}</button>)}</div>}>
      {tab === 'vaults' && (boxes.data ? <VaultRows boxes={boxes.data} rounds={rounds.data} account={acct} filter="mine" /> : <div className="o-table" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="o-tr skeleton" />)}</div>)}
      {tab === 'wrote' && <RoundTable rows={wrote} side="wrote" onOpen={setSheet} />}
      {tab === 'bought' && <RoundTable rows={bought} side="bought" onOpen={setSheet} />}
      {tab === 'activity' && <div className="o-pad"><Feed txns={txns.data} error={txns.error} loading={txns.loading} limit={20} filter={t => t.signer === acct} /></div>}
    </Card>
    <div className="o-row o-row-end"><button className="o-btn o-btn-line o-btn-sm" onClick={wallet.disconnect}>Sign out</button></div>
    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
