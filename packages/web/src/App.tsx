import { useEffect, useState } from 'react';
import Landing from './Landing';
import Vaults from './Vaults';
import VaultPage from './VaultPage';
import MarketV5 from './MarketV5';
import Write from './Write';
import Positions from './Positions';
import Activity from './Activity';
import Security from './SecurityV5';
import Settings from './Settings';
import How from './How';
import Terminal from './Terminal';
import BridgePage from './BridgePage';
import { AppBar, StatusBar, TabBar, type Page } from './shell';
import { Icon } from './ui';
import { useWallet } from './wallet';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const on = () => setPath(location.pathname); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  return path;
}

const ROUTES: [RegExp, Page][] = [
  [/^\/app\/?$/, 'terminal'], [/^\/bridge/, 'bridge'], [/^\/vaults\/?$/, 'vaults'], [/^\/market/, 'market'], [/^\/write/, 'write'], [/^\/(positions|you)/, 'positions'],
  [/^\/activity/, 'activity'], [/^\/security/, 'security'], [/^\/settings/, 'settings'], [/^\/how/, 'how'],
];
const TITLES: Record<Page, string> = { terminal: 'Otzar · Vault', bridge: 'Otzar · Bridge BTC', home: 'Otzar · The quantum-safe Bitcoin vault that earns', how: 'Otzar · How it works', vaults: 'Otzar · Vaults', vault: 'Otzar · Vault', market: 'Otzar · Buy calls', write: 'Otzar · Write a call', positions: 'Otzar · Positions', activity: 'Otzar · Activity', security: 'Otzar · Quantum security', settings: 'Otzar · Settings' };

export default function App() {
  const path = usePath();
  const wallet = useWallet();
  const vaultSegment = path.match(/^\/vault\/([^/]+)/)?.[1];
  let vaultId = vaultSegment;
  if (vaultSegment) {
    try { vaultId = decodeURIComponent(vaultSegment); }
    catch { /* An invalid escape is an unknown token, handled by the vault page's empty state. */ }
  }
  const page: Page = vaultId ? 'vault' : ROUTES.find(([re]) => re.test(path))?.[1] || 'home';
  const writeFor = new URLSearchParams(location.search).get('vault') || '';
  useEffect(() => { document.title = page === 'vault' ? `Otzar · ${vaultId}` : TITLES[page]; }, [page, vaultId]);

  const banner = wallet.error && <p className="banner" role="alert">{wallet.error}<button onClick={() => wallet.setError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button></p>;
  if (page === 'home' || page === 'how') return <div className="site"><a className="skip" href="#main">Skip to content</a>{banner}{page === 'home' ? <Landing /> : <How />}</div>;

  return <div className="o-app">
    <a className="skip" href="#main">Skip to content</a>
    <AppBar page={page} wallet={wallet} />
    {banner}
    <main id="main" className="o-main" key={page + (vaultId || '')}>
      {page === 'terminal' && <Terminal wallet={wallet} />}
      {page === 'bridge' && <BridgePage wallet={wallet} />}
      {page === 'vaults' && <Vaults wallet={wallet} />}
      {page === 'vault' && <VaultPage id={vaultId!} wallet={wallet} />}
      {page === 'market' && <MarketV5 wallet={wallet} />}
      {page === 'write' && <Write wallet={wallet} initial={writeFor} />}
      {page === 'positions' && <Positions wallet={wallet} />}
      {page === 'activity' && <Activity />}
      {page === 'security' && <Security wallet={wallet} />}
      {page === 'settings' && <Settings wallet={wallet} />}
    </main>
    <StatusBar />
    <TabBar page={page} />
  </div>;
}
