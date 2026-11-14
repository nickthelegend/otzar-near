import type { ReactNode } from 'react';
import { contractId, nearblocksAccount, short } from './lib';
import { useBoxes } from './data';
import { useBtcPrice, useCodeHash, useFlash, useNearBlock, usd } from './live';
import { Icon, Link, Wordmark, type IconName } from './ui';
import type { Wallet } from './wallet';

export type Page = 'terminal' | 'bridge' | 'home' | 'how' | 'vaults' | 'vault' | 'market' | 'write' | 'positions' | 'activity' | 'security' | 'settings';
export const NAV: { page: Page; to: string; label: string; icon: IconName; phone?: boolean }[] = [
  { page: 'terminal', to: '/app', label: 'Vault', icon: 'lock', phone: true },
  { page: 'bridge', to: '/bridge', label: 'Bridge', icon: 'send', phone: true },
  { page: 'market', to: '/market', label: 'Buy calls', icon: 'coin', phone: true },
  { page: 'positions', to: '/positions', label: 'Portfolio', icon: 'wallet', phone: true },
  { page: 'activity', to: '/activity', label: 'Activity', icon: 'wave' },
  { page: 'security', to: '/security', label: 'Security', icon: 'shield', phone: true },
];

/** The live BTC-USD trade in the bar; flashes jade or blush on every change. */
export function BtcTicker({ dark = false }: { dark?: boolean }) {
  const p = useBtcPrice(); const flash = useFlash(p.price);
  const change = p.price && p.open24 ? ((p.price - p.open24) / p.open24) * 100 : null;
  return <span className={`o-btc ${dark ? 'o-btc-dark' : ''} ${flash ? `flash-${flash}` : ''}`} title={p.error || 'Last BTC-USD trade on Coinbase Exchange, refreshed every 4 s'}>
    <i className="o-btc-glyph" aria-hidden="true">₿</i>
    <b className="tnum">{p.price ? usd(p.price) : p.error ? 'Unavailable' : '…'}</b>
    {change !== null && <small className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</small>}
  </span>;
}

/** The quantum-safe indicator: always visible in the app bar, opens the Security page. */
export function ShieldPill({ wallet }: { wallet: Wallet }) {
  const boxes = useBoxes();
  const mine = boxes.data?.filter(b => b.owner_id === wallet.account) || [];
  const locked = mine.filter(b => b.pq_key).length;
  const label = wallet.account && mine.length ? `${locked}/${mine.length} locked` : 'Quantum-safe';
  const warn = !!wallet.account && mine.length > 0 && locked < mine.length;
  return <Link to="/security" className={`o-shield ${warn ? 'o-shield-warn' : ''}`} title="Every spend, transfer and listing of a locked vault needs an ML-DSA-65 signature, checked on NEAR">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2.8 4.6 5.7v5.6c0 4.7 3.1 8.6 7.4 9.9 4.3-1.3 7.4-5.2 7.4-9.9V5.7L12 2.8Z" fill="currentColor" opacity=".18" /><path d="M12 2.8 4.6 5.7v5.6c0 4.7 3.1 8.6 7.4 9.9 4.3-1.3 7.4-5.2 7.4-9.9V5.7L12 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8.6 12.2l2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>{label}</span><em>ML-DSA-65</em>
  </Link>;
}

export function AppBar({ page, wallet }: { page: Page; wallet: Wallet }) {
  const on = (p: Page) => (page === p || (p === 'terminal' && (page === 'vault' || page === 'vaults')) ? 'page' : undefined);
  return <header className="o-bar">
    <div className="o-bar-row">
      <Link to="/" className="o-logo" aria-label="Otzar home"><Wordmark /></Link>
      <nav className="o-nav" aria-label="App">{NAV.map(n => <Link key={n.page} to={n.to} aria-current={on(n.page)}>{n.label}</Link>)}</nav>
      <div className="o-bar-end">
        <BtcTicker />
        <ShieldPill wallet={wallet} />
        <Link to="/settings" className="o-icon-btn" aria-label="Settings" aria-current={on('settings')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg></Link>
        {wallet.account
          ? <Link to="/positions" className="o-acct" title={wallet.account}><span className="o-acct-dot" aria-hidden="true" />{short(wallet.account, 10, 6)}</Link>
          : <button className="o-btn o-btn-ink o-btn-sm" onClick={wallet.connect} disabled={!wallet.ready}>Connect</button>}
      </div>
    </div>
  </header>;
}

/** Aevo-style status line: chain heartbeat, the live BTC trade and the contract's code hash. */
export function StatusBar() {
  const block = useNearBlock(); const code = useCodeHash(contractId);
  const ok = !!block.height && !block.error;
  return <footer className="o-status" aria-label="Network status">
    <span className={`o-status-net ${ok ? 'ok' : 'bad'}`}><i aria-hidden="true" />{ok ? 'NEAR testnet' : block.error ? 'RPC unavailable' : 'Connecting…'}</span>
    <span className="tnum">Block {block.height ? block.height.toLocaleString('en-US') : '…'}</span>
    {block.protocol && <span>Protocol {block.protocol}</span>}
    <span className="o-status-sep" aria-hidden="true" />
    <span>BTC-USD <BtcTicker dark /></span>
    <span className="o-status-grow" />
    <span className="o-status-pq"><Icon name="shield" size={13} /> ML-DSA-65 verified in the contract</span>
    {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer" title={code.data ? `Deployed code sha256 ${code.data.hash}` : ''}>Code {code.data ? code.data.hash.slice(0, 8) : '…'} <Icon name="external" size={11} /></a>}
  </footer>;
}

export function TabBar({ page }: { page: Page }) {
  const on = (p: Page) => (page === p || (p === 'terminal' && (page === 'vault' || page === 'vaults')) ? 'page' : undefined);
  return <nav className="o-tabs" aria-label="App tabs">
    {NAV.filter(n => n.phone).map(n => <Link key={n.page} to={n.to} aria-current={on(n.page)}><Icon name={n.icon} size={20} /><span>{n.label.replace(' call', '').replace('Buy calls', 'Buy')}</span></Link>)}
  </nav>;
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return <header className="o-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions && <div className="o-head-actions">{actions}</div>}</header>;
}
