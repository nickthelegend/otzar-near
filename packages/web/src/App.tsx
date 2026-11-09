import { useEffect, useState } from 'react';
import Landing from './Landing';
import Earn from './Earn';
import Vaults from './Vaults';
import VaultPage from './VaultPage';
import You from './You';
import LiveTape from './tape';
import { contractId, nearblocksAccount, short } from './lib';
import { Icon, Link, Wordmark } from './ui';
import { useWallet, type Wallet } from './wallet';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const on = () => setPath(location.pathname); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  return path;
}

type Page = 'home' | 'earn' | 'vaults' | 'vault' | 'you';
const NAV: { page: Page; to: string; label: string }[] = [
  { page: 'earn', to: '/app', label: 'Earn' },
  { page: 'vaults', to: '/vaults', label: 'Vaults' },
  { page: 'you', to: '/you', label: 'You' },
];

function AppBar({ page, wallet }: { page: Page; wallet: Wallet }) {
  const on = (p: Page) => (page === p || (p === 'vaults' && page === 'vault') ? 'page' : undefined);
  return <header className="bar">
    <div className="bar-row">
      <Link to="/" className="bar-logo" aria-label="Hako home"><Wordmark /></Link>
      <nav className="seg-nav" aria-label="App">
        {NAV.map(n => <Link key={n.page} to={n.to} aria-current={on(n.page)}>{n.label}</Link>)}
      </nav>
      <div className="bar-end">
        <span className="net"><i />Testnet</span>
        {wallet.account
          ? <Link to="/you" className="acct-pill" title={wallet.account}><Icon name="user" size={15} />{short(wallet.account, 10, 6)}</Link>
          : <button className="pill pill-ice pill-sm" onClick={wallet.connect} disabled={!wallet.ready}>Connect</button>}
      </div>
    </div>
  </header>;
}

export default function App() {
  const path = usePath();
  const wallet = useWallet();
  const vaultId = path.match(/^\/vault\/([^/]+)/)?.[1];
  const page: Page = vaultId ? 'vault' : path.startsWith('/app') ? 'earn' : path.startsWith('/vaults') ? 'vaults' : path.startsWith('/you') ? 'you' : 'home';
  useEffect(() => {
    const t: Record<Page, string> = { home: 'Hako · Quantum-safe Bitcoin that earns', earn: 'Hako · Earn', vaults: 'Hako · Vaults', vault: `Hako · ${vaultId}`, you: 'Hako · You' };
    document.title = t[page];
  }, [page, vaultId]);

  const banner = wallet.error && <p className="banner" role="alert">{wallet.error}<button onClick={() => wallet.setError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button></p>;
  if (page === 'home') return <div className="site"><a className="skip" href="#main">Skip to content</a>{banner}<Landing /></div>;

  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <AppBar page={page} wallet={wallet} />
    <LiveTape />
    {banner}
    <main id="main" className="app-main">
      {page === 'earn' && <Earn wallet={wallet} />}
      {page === 'vaults' && <Vaults wallet={wallet} />}
      {page === 'vault' && <VaultPage id={decodeURIComponent(vaultId!)} wallet={wallet} />}
      {page === 'you' && <You wallet={wallet} />}
    </main>
    <footer className="app-foot">
      <span>Hako · NEAR testnet and local chains · MIT · © 2026 Nivesh Gajengi</span>
      {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">{contractId} <Icon name="external" size={12} /></a>}
    </footer>
  </div>;
}
