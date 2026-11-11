import { useEffect, useState } from 'react';
import Landing from './Landing';
import Dashboard from './Dashboard';
import VaultPage from './VaultPage';
import Portfolio from './Portfolio';
import How from './How';
import { contractId, nearblocksAccount, short } from './lib';
import { Icon, Link, Wordmark, type IconName } from './ui';
import { useWallet, type Wallet } from './wallet';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const on = () => setPath(location.pathname); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  return path;
}

type Page = 'home' | 'how' | 'vaults' | 'vault' | 'you';
const NAV: { page: Page; to: string; label: string; icon: IconName }[] = [
  { page: 'vaults', to: '/app', label: 'Vaults', icon: 'grid' },
  { page: 'you', to: '/you', label: 'Portfolio', icon: 'user' },
];

function AppBar({ page, wallet }: { page: Page; wallet: Wallet }) {
  const on = (p: Page) => (page === p || (p === 'vaults' && page === 'vault') ? 'page' : undefined);
  return <header className="bar">
    <div className="bar-row">
      <Link to="/" className="bar-logo" aria-label="Otzar home"><Wordmark /></Link>
      <nav className="seg-nav" aria-label="App">
        {NAV.map(n => <Link key={n.page} to={n.to} aria-current={on(n.page)}>{n.label}</Link>)}
      </nav>
      <div className="bar-end">
        <span className="net"><i />Testnet</span>
        {wallet.account
          ? <Link to="/you" className="acct-pill" title={wallet.account}><Icon name="user" size={15} />{short(wallet.account, 10, 6)}</Link>
          : <button className="pill pill-ink pill-sm" onClick={wallet.connect} disabled={!wallet.ready}>Connect</button>}
      </div>
    </div>
  </header>;
}

/** Phones: one floating pill of tabs at the bottom, the way Polaris carries its nav. */
function TabBar({ page }: { page: Page }) {
  const on = (p: Page) => (page === p || (p === 'vaults' && page === 'vault') ? 'page' : undefined);
  return <nav className="tabbar" aria-label="App tabs">
    {NAV.map(n => <Link key={n.page} to={n.to} aria-current={on(n.page)}><Icon name={n.icon} size={20} /><span>{n.label}</span></Link>)}
    <Link to="/how"><Icon name="spark" size={20} /><span>How it works</span></Link>
  </nav>;
}

export default function App() {
  const path = usePath();
  const wallet = useWallet();
  const vaultSegment = path.match(/^\/vault\/([^/]+)/)?.[1];
  let vaultId = vaultSegment;
  if (vaultSegment) {
    try { vaultId = decodeURIComponent(vaultSegment); }
    catch { /* An invalid escape is an unknown token, handled by the existing empty state. */ }
  }
  const page: Page = vaultId ? 'vault' : path.startsWith('/app') || path.startsWith('/vaults') ? 'vaults' : path.startsWith('/you') ? 'you' : path.startsWith('/how') ? 'how' : 'home';
  useEffect(() => {
    const t: Record<Page, string> = { home: 'Otzar · Earn on your Bitcoin', how: 'Otzar · How it works', vaults: 'Otzar · Vaults', vault: `Otzar · ${vaultId}`, you: 'Otzar · Portfolio' };
    document.title = t[page];
  }, [page, vaultId]);

  const banner = wallet.error && <p className="banner" role="alert">{wallet.error}<button onClick={() => wallet.setError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button></p>;
  if (page === 'home' || page === 'how') return <div className="site"><a className="skip" href="#main">Skip to content</a>{banner}{page === 'home' ? <Landing /> : <How />}</div>;

  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <AppBar page={page} wallet={wallet} />
    {banner}
    <main id="main" className="app-main">
      {page === 'vaults' && <Dashboard wallet={wallet} />}
      {page === 'vault' && <VaultPage id={vaultId!} wallet={wallet} />}
      {page === 'you' && <Portfolio wallet={wallet} />}
    </main>
    <footer className="app-foot">
      <span>Otzar · NEAR testnet and local chains · MIT · © 2026 Nivesh Gajengi</span>
      {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer" title="Deployed under Otzar's former name, Hako">Contract {contractId} <Icon name="external" size={12} /></a>}
    </footer>
    <TabBar page={page} />
  </div>;
}
